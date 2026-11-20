/**
 * Resource editor controller hook.
 *
 * Manages the draft, dry-run, write, 409 handling, and reconciliation state.
 * Consumes KubernetesTransport by injection (ADR 0001).
 */
import { useState, useCallback, useEffect, useRef } from "react";
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
  parseDraft,
  computeDiff,
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
  /**
   * Reconciliation state after a write (review fix #7). Reactive: updates when
   * observed status changes. Call after submit() with the returned object.
   */
  readonly reconciliation: ReconciliationState<TStatus> | null;
  /**
   * Start observing reconciliation for the submitted object (review fix #7).
   * Sets up watchStatus or refetch; updates `reconciliation` state reactively.
   */
  readonly startReconciliation: (
    submitted: KubeObject<TSpec, TStatus>,
    signal?: AbortSignal,
  ) => void;
}

/**
 * Extract WriteError from catch block (review fix #6). Deduplicates error handling
 * between dryRun and submit.
 */
const extractWriteError = (error: unknown): WriteError => {
  if (isKubernetesWriteRejection(error)) {
    return error.writeError;
  }
  return { kind: "server-error", detail: String(error) };
};

export const useResourceEditor = <TSpec = unknown, TStatus = unknown>({
  transport,
  ref,
  seed,
  verb,
  deployed,
}: UseResourceEditorProps<TSpec, TStatus>): UseResourceEditorResult<TSpec, TStatus> => {
  const draft = createDraftFromObject(seed);
  const yamlText = serializeDocument(draft.document);
  const initialDiff = deployed ? computeDiff(deployed, draft.object) : null;

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
    diff: initialDiff,
  });

  // Review fix #4: Keep a ref to the current state to avoid stale closures
  const stateRef = useRef(state);
  stateRef.current = state;

  // Review fix #7: Reactive reconciliation state
  const [reconciliation, setReconciliation] = useState<ReconciliationState<TStatus> | null>(null);

  // Review fix #1: Recompute diff when deployed or draft.object changes
  useEffect(() => {
    const newDiff = state.deployed && state.draft.object
      ? computeDiff(state.deployed, state.draft.object)
      : null;
    setState((prev) => ({ ...prev, diff: newDiff }));
  }, [state.deployed, state.draft.object]);

  const setMode = useCallback((mode: EditorMode) => {
    setState((prev) => ({ ...prev, mode }));
  }, []);

  const updateFields = useCallback((updates: readonly FieldUpdate[]) => {
    setState((prev) => {
      const newDoc = prev.draft.document.clone();
      applyFieldUpdates(newDoc, updates);

      // Review fix #5: Call parseDraft directly instead of serialize→re-parse
      const parsed = parseDraft<TSpec>(newDoc, prev.draft);
      const newYaml = serializeDocument(newDoc);
      return { ...prev, draft: parsed, yamlText: newYaml };
    });
  }, []);

  const updateYaml = useCallback((text: string) => {
    setState((prev) => {
      // Review fix #2: Pass previousDraft to preserve lastValidObject
      const parsed = parseYamlText<TSpec>(text, prev.draft);
      return { ...prev, draft: parsed, yamlText: text };
    });
  }, []);

  const buildCandidate = (currentState: EditorState<TSpec>): WriteCandidate<TSpec> | null => {
    if (!currentState.draft.object) return null;

    return {
      object: currentState.draft.object,
      ...(currentState.verb === "update" && currentState.resourceVersion
        ? { expectedResourceVersion: currentState.resourceVersion }
        : {}),
    };
  };

  const dryRun = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setState((prev) => ({ ...prev, submitting: true, errors: [] }));
      try {
        // Review fix #4: Read current state from ref to avoid stale closure
        const currentState = stateRef.current;
        const candidate = buildCandidate(currentState);

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

        const admitted = await transport.dryRun<TSpec, TStatus>(candidate, currentState.verb, signal);
        setState((prev) => ({ ...prev, admitted, submitting: false, errors: [] }));
      } catch (error) {
        // Review fix #6: Use extracted helper
        const writeError = extractWriteError(error);
        setState((prev) => ({ ...prev, submitting: false, errors: [writeError] }));
      }
    },
    [transport],
  );

  const submit = useCallback(
    async (signal?: AbortSignal): Promise<KubeObject<TSpec, TStatus>> => {
      setState((prev) => ({ ...prev, submitting: true, errors: [] }));
      try {
        // Review fix #4: Read current state from ref to avoid stale closure
        const currentState = stateRef.current;
        const candidate = buildCandidate(currentState);

        if (!candidate) {
          throw new Error("Invalid YAML: cannot build candidate");
        }

        const result =
          currentState.verb === "create"
            ? await transport.create<TSpec, TStatus>(candidate, signal)
            : await transport.update<TSpec, TStatus>(candidate, signal);

        setState((prev) => ({ ...prev, submitting: false, errors: [] }));
        return result;
      } catch (error) {
        // Review fix #6: Use extracted helper
        const writeError = extractWriteError(error);
        setState((prev) => ({ ...prev, submitting: false, errors: [writeError] }));
        throw error;
      }
    },
    [transport],
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

  const startReconciliation = useCallback(
    (submitted: KubeObject<TSpec, TStatus>, signal?: AbortSignal): void => {
      setReconciliation({
        submitted,
        observed: null,
        reconciled: false,
      });

      if (transport.watchStatus) {
        const unsubscribe = transport.watchStatus<TSpec, TStatus>(
          ref,
          (observed) => {
            const reconciled =
              observed.status &&
              typeof observed.status === "object" &&
              "observedGeneration" in observed.status &&
              observed.status.observedGeneration === observed.metadata.generation;

            setReconciliation({ submitted, observed, reconciled: Boolean(reconciled) });
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

            setReconciliation({ submitted, observed, reconciled: Boolean(reconciled) });
          })
          .catch(() => {
            // Ignore refetch errors
          });
      }
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
    reconciliation,
    startReconciliation,
  };
};
