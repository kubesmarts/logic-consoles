/**
 * Browser localStorage interface for console-owned state.
 *
 * ADR 0001 "Browser storage": version the stored format, keep UI preferences and
 * author workflow drafts, retain each draft's target context, support list/save/
 * remove/YAML-export. A failed save must leave the draft in memory and offer export.
 *
 * SECURITY INVARIANT: credentials, tokens, Secret contents and execution payloads
 * are NEVER persisted (AGENTS.md). Only the types below may be stored. The draft
 * carries workflow YAML (authoring content), NOT execution input.
 */

/** Bump when the stored shape changes incompatibly; the store migrates or discards. */
export const STORAGE_SCHEMA_VERSION = 1 as const;

/** The target a draft will publish to. No credentials — only identity by name. */
export interface DraftTargetContext {
  /** kubeconfig context name the draft was authored against. */
  readonly contextName: string;
  /** Target Kubernetes namespace. */
  readonly namespace: string;
  /** Chosen runtime name, once selected. */
  readonly runtimeName?: string;
}

export interface WorkflowDraft {
  readonly id: string;
  /** Author-facing label (defaults to the workflow document name). */
  readonly title: string;
  /** The portable workflow YAML. NEVER execution input or secrets. */
  readonly workflowYaml: string;
  readonly target: DraftTargetContext;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ThemePreference = "light" | "dark" | "system";

export interface UiPreferences {
  readonly theme: ThemePreference;
  /** Last selected namespace per context, for convenience on return. */
  readonly lastNamespaceByContext?: Readonly<Record<string, string>>;
  readonly navCollapsed?: boolean;
}

/** The versioned envelope actually written to localStorage. */
export interface StoredEnvelope {
  readonly schemaVersion: typeof STORAGE_SCHEMA_VERSION;
  readonly preferences: UiPreferences;
  readonly drafts: readonly WorkflowDraft[];
}

/** Outcome of a save. On failure the caller keeps the in-memory draft and offers export. */
export type DraftSaveOutcome =
  | { readonly ok: true; readonly draft: WorkflowDraft }
  | { readonly ok: false; readonly reason: "quota-exceeded" | "unavailable" | "serialize-error"; readonly draft: WorkflowDraft };

/**
 * Console-owned persistence. Implemented over localStorage by the shell (packet A);
 * injected so tests and the Operational Console host can supply alternatives.
 */
export interface ConsoleStorage {
  readPreferences(): UiPreferences;
  writePreferences(next: UiPreferences): void;

  listDrafts(): readonly WorkflowDraft[];
  getDraft(id: string): WorkflowDraft | undefined;
  /** Persist a draft; returns failure (not throw) so the UI can offer export. */
  saveDraft(draft: WorkflowDraft): DraftSaveOutcome;
  removeDraft(id: string): void;

  /** Serialize a draft to a downloadable YAML string (export always works, even if save failed). */
  exportDraftYaml(draft: WorkflowDraft): string;
}
