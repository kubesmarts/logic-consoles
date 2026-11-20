/**
 * Resource editor controller hook.
 *
 * Manages the draft, dry-run, write, 409 handling, and reconciliation state.
 * Consumes KubernetesTransport by injection (ADR 0001).
 */
import { useState, useCallback, useRef } from "react";
import type {
  KubeObject,
  KubernetesTransport,
  ResourceRef,
  WriteCandidate,
  WriteError,
  WriteVerb,
} from "../contracts/index.ts";
import { isKubernetesWriteRejection } from "../contracts/index.ts";
import type { EditorState, EditorMode, FieldUpdate, ReconciliationState } from "./types.ts";
import {
  createDraftFromObject,
  parseYamlText,
  serializeDocument,
  applyFieldUpdates,
} from "./yaml-utils.ts";

export interface UseResourceEditorProps<TSpec = unknown, TStatus = unknown> {
  /** The transport for Kubernetes operations. */
  readonly transport: KubernetesTransport;
  /** Resource reference. */
  readonly ref: ResourceRef;
  /** Seed from a live object (update path) or a template (create path). */
  readonly seed: KubeObject<TSpec, TStatus>;
  /** The verb (create or update). */
  readonly verb: WriteVerb;
  /** The deployed object for diff/comparison (update path only). */
  readonly deployed?: KubeObject<TSpec, TStatus>;
}

export interface UseResourceEditorResult<TSpec = unknown, TStatus = unknown> {
  readonly state: EditorState<TSpec>;
  /** Switch between form and YAML mode. */
  readonly setMode: (mode: EditorMode) => void;
  /** Update field(s) from the form. */
  readonly updateFields: (updates: readonly FieldUpdate[]) => void;
  /** Update the YAML text directly. */
  readonly updateYaml: (text: string) => void;
  /** Run a server dry-run of the exact candidate. */
  readonly dryRun: (signal?: AbortSignal) => Promise<void>;
  /** Submit the write (create or update). */
  readonly submit: (signal?: AbortSignal) => Promise<KubeObject<TSpec, TStatus>>;
  /** Reload the latest version after a 409 conflict. */
  readonly reloadAfterConflict: (signal?: AbortSignal) => Promise<KubeObject<TSpec, TStatus>>;
  /** Watch or refetch status after a write. */
  readonly watchReconciliation: (
    submitted: KubeObject<TSpec, TStatus>,
    signal?: AbortSignal,
  ) => ReconciliationState<TStatus> | null;
}

export const useResourceEditor = <TSpec = unknown, TStatus = unknown>({
  transport,
  ref,
  seed,
  verb,
  deployed,
}: UseResourceEditorProps<TSpec, TStatus>): UseResourceEditorResult<TSpec, TStatus> => {
  const draft = createDraftFromObject(seed);
  const yamlText = serializeDocument(draft.document);

  const [state, setState] = useState<EditorState<TSpec>>({
    ref,
    mode: "form",
    draft,
    yamlText,
    resourceVersion: seed.metadata.resourceVersion,
    verb,
    admitted: null,
    errors: [],
    submitting: false,
    deployed: deployed ?? null,
  });

  const setMode = useCallback((mode: EditorMode) => {
    setState((prev) => ({ ...prev, mode }));
  }, []);

  const updateFields = useCallback((updates: readonly FieldUpdate[]) => {
    setState((prev) => {
      const newDoc = prev.draft.document.clone();
      applyFieldUpdates(newDoc, updates);
      const newYaml = serializeDocument(newDoc);

      // Re-parse to update object
      const parsed = parseYamlText<TSpec>(newYaml);
      return { ...prev, draft: parsed, yamlText: newYaml };
    });
  }, []);

  const updateYaml = useCallback((text: string) => {
    setState((prev) => {
      const parsed = parseYamlText<TSpec>(text);
      return { ...prev, draft: parsed, yamlText: text };
    });
  }, []);

  const buildCandidate = useCallback(
    (currentState: EditorState<TSpec>): WriteCandidate<TSpec> | null => {
      if (!currentState.draft.object) return null;

      return {
        object: currentState.draft.object,
        ...(currentState.verb === "update" && currentState.resourceVersion
          ? { expectedResourceVersion: currentState.resourceVersion }
          : {}),
      };
    },
    [],
  );

  const dryRun = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setState((prev) => ({ ...prev, submitting: true, errors: [] }));
      try {
        const candidate = buildCandidate(state);
        if (!candidate) {
          setState((prev) => ({
            ...prev,
            submitting: false,
            errors: [
              {
                kind: "admission",
                errors: [{ path: "", message: "Invalid YAML: cannot build candidate" }],
              },
            ],
          }));
          return;
        }

        const admitted = await transport.dryRun<TSpec, TStatus>(candidate, state.verb, signal);
        setState((prev) => ({ ...prev, admitted, submitting: false, errors: [] }));
      } catch (error) {
        const errors: WriteError[] = [];
        if (isKubernetesWriteRejection(error)) {
          errors.push(error.writeError);
        } else {
          errors.push({ kind: "server-error", detail: String(error) });
        }
        setState((prev) => ({ ...prev, submitting: false, errors }));
      }
    },
    [transport, state, buildCandidate],
  );

  const submit = useCallback(
    async (signal?: AbortSignal): Promise<KubeObject<TSpec, TStatus>> => {
      setState((prev) => ({ ...prev, submitting: true, errors: [] }));
      try {
        const candidate = buildCandidate(state);
        if (!candidate) {
          throw new Error("Invalid YAML: cannot build candidate");
        }

        const result =
          state.verb === "create"
            ? await transport.create<TSpec, TStatus>(candidate, signal)
            : await transport.update<TSpec, TStatus>(candidate, signal);

        setState((prev) => ({ ...prev, submitting: false, errors: [] }));
        return result;
      } catch (error) {
        const errors: WriteError[] = [];
        if (isKubernetesWriteRejection(error)) {
          errors.push(error.writeError);
        } else {
          errors.push({ kind: "server-error", detail: String(error) });
        }
        setState((prev) => ({ ...prev, submitting: false, errors }));
        throw error;
      }
    },
    [transport, state, buildCandidate],
  );

  const reloadAfterConflict = useCallback(
    async (signal?: AbortSignal): Promise<KubeObject<TSpec, TStatus>> => {
      const latest = await transport.get<TSpec, TStatus>(ref, signal);
      setState((prev) => ({
        ...prev,
        deployed: latest,
        resourceVersion: latest.metadata.resourceVersion,
      }));
      return latest;
    },
    [transport, ref],
  );

  const reconciliationRef = useRef<ReconciliationState<TStatus> | null>(null);

  const watchReconciliation = useCallback(
    (submitted: KubeObject<TSpec, TStatus>, signal?: AbortSignal): ReconciliationState<TStatus> | null => {
      const reconciliation: ReconciliationState<TStatus> = {
        submitted,
        observed: null,
        reconciled: false,
      };
      reconciliationRef.current = reconciliation;

      if (transport.watchStatus) {
        const unsubscribe = transport.watchStatus<TSpec, TStatus>(
          ref,
          (observed) => {
            const reconciled =
              observed.status &&
              typeof observed.status === "object" &&
              "observedGeneration" in observed.status &&
              observed.status.observedGeneration === observed.metadata.generation;

            reconciliationRef.current = { submitted, observed, reconciled: Boolean(reconciled) };
          },
          signal,
        );

        signal?.addEventListener("abort", unsubscribe);
      } else {
        // Fallback: refetch once
        transport
          .get<TSpec, TStatus>(ref, signal)
          .then((observed) => {
            const reconciled =
              observed.status &&
              typeof observed.status === "object" &&
              "observedGeneration" in observed.status &&
              observed.status.observedGeneration === observed.metadata.generation;

            reconciliationRef.current = { submitted, observed, reconciled: Boolean(reconciled) };
          })
          .catch(() => {
            // Ignore refetch errors
          });
      }

      return reconciliationRef.current;
    },
    [transport, ref],
  );

  return {
    state,
    setMode,
    updateFields,
    updateYaml,
    dryRun,
    submit,
    reloadAfterConflict,
    watchReconciliation,
  };
};
