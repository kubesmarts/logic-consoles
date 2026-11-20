/**
 * Resource editor public interface.
 *
 * Packets D (setup wizards) and E (publish review) import from here. The editor
 * is kind-agnostic and transport-injected (ADR 0001).
 */
export { ResourceEditor, type ResourceEditorProps } from "./ResourceEditor.tsx";
export { useResourceEditor, type UseResourceEditorProps, type UseResourceEditorResult } from "./useResourceEditor.ts";
export type {
  EditorState,
  EditorMode,
  FieldUpdate,
  ReconciliationState,
  ParsedDraft,
  DiffResult,
  FieldDiff,
} from "./types.ts";
