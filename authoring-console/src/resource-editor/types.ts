/**
 * Resource editor types and state.
 *
 * The editor owns ONE draft of the full user-editable CR (ADR 0001 "Resource editing").
 * Hold it as a parsed YAML Document so form edits and text edits mutate the same source.
 * resourceVersion is held SEPARATELY and never editable.
 */
import type { Document, YAMLParseError } from "yaml";
import type {
  KubeObject,
  ResourceRef,
  ResourceVersion,
  WriteVerb,
  WriteError,
} from "../contracts/index.ts";

export type EditorMode = "form" | "yaml";

export interface ParsedDraft<TSpec = unknown> {
  /** The parsed YAML document — form and text both edit this. */
  readonly document: Document;
  /** Extracted object for validation/display. null when YAML is invalid. */
  readonly object: KubeObject<TSpec> | null;
  /** true when the YAML text is syntactically invalid. */
  readonly invalid: boolean;
  /**
   * Last valid object before YAML became invalid. Used for stale preview in form
   * view when the YAML is syntactically invalid (review fix #2).
   */
  readonly lastValidObject: KubeObject<TSpec> | null;
  /** Parse errors with line/column positions (review fix #3). */
  readonly diagnostics: readonly YAMLParseError[];
}

/**
 * Field-level difference between deployed and draft (review fix #1).
 * Kind-agnostic structural comparison for the update path.
 */
export interface FieldDiff {
  readonly path: string;
  readonly deployed: unknown;
  readonly draft: unknown;
}

export interface DiffResult {
  /** Fields that differ between deployed and draft. */
  readonly changed: readonly FieldDiff[];
  /** Fields in deployed but not in draft (removed). */
  readonly removed: readonly FieldDiff[];
  /** Fields in draft but not in deployed (added). */
  readonly added: readonly FieldDiff[];
}

/**
 * The full editor state. resourceVersion is held separately from the draft (ADR 0001:
 * "Remove server-managed fields from editable content and retain concurrency tokens separately").
 */
export interface EditorState<TSpec = unknown> {
  readonly ref: ResourceRef;
  readonly mode: EditorMode;
  /** The current draft (may be invalid YAML). */
  readonly draft: ParsedDraft<TSpec>;
  /** The raw YAML text (preserved when invalid; derived from document when valid). */
  readonly yamlText: string;
  /** Loaded resourceVersion for update concurrency check; undefined for create. */
  readonly resourceVersion?: ResourceVersion;
  /** The verb that will be submitted (create or update). */
  readonly verb: WriteVerb;
  /** Admitted object from the last successful dry-run, or null. */
  readonly admitted: KubeObject<TSpec> | null;
  /** Admission/write errors from the last operation. */
  readonly errors: readonly WriteError[];
  /** true when a dry-run or write is in flight. */
  readonly submitting: boolean;
  /** The deployed object for diff/comparison (populated on update path). */
  readonly deployed: KubeObject<TSpec> | null;
  /**
   * Deployed-to-draft diff for the update path (review fix #1). Null on create or
   * when no deployed object is available.
   */
  readonly diff: DiffResult | null;
}

/**
 * Form field updates. The editor patches only owned paths in the YAML document
 * (ADR 0001: "Forms patch only owned paths… retaining legal advanced fields").
 */
export interface FieldUpdate {
  /** JSON/YAML path, e.g., "spec.runtimeRef.name". */
  readonly path: string;
  /** New value. undefined deletes the path. */
  readonly value: unknown;
}

/**
 * Reconciliation state after a write. Distinguish submission from reconciliation
 * (ADR 0001: "Watch or refetch conditions… checking observed generation").
 */
export interface ReconciliationState<TStatus = unknown> {
  /** The object returned by create/update. */
  readonly submitted: KubeObject<unknown, TStatus>;
  /** The latest observed object (via watchStatus or refetch). */
  readonly observed: KubeObject<unknown, TStatus> | null;
  /** true when observedGeneration matches metadata.generation. */
  readonly reconciled: boolean;
  readonly error?: string;
}
