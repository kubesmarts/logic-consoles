/**
 * Authoring workspace types — E1's public API for E2 (publish flow).
 *
 * E2 will import `useAuthoringContext` to obtain the current edited document and
 * parsed workflow identity for publishing. E1 owns the authoring workspace; E2 owns
 * runtime selection, CR-name generation, version suggestion, and the publish action.
 */

/**
 * Parsed workflow identity from the current document. E2 uses this to resolve the
 * family, suggest a version, and generate the CR name. Returns undefined if the
 * document is invalid or missing required fields.
 */
export interface ParsedWorkflowIdentity {
  readonly workflowName: string;
  readonly version: string;
  /** Document namespace (admission normalizes it to the CR namespace). */
  readonly namespace: string;
}

/**
 * The current authoring state E2 reads to initiate publishing. E2 imports this
 * hook from `src/authoring/index.ts`.
 */
export interface AuthoringContextValue {
  /** The portable workflow YAML as edited (may be invalid). */
  readonly workflowYaml: string;
  /** Parsed identity if valid; undefined otherwise. E2 blocks publish on undefined. */
  readonly parsedIdentity: ParsedWorkflowIdentity | undefined;
  /** True when there are unsaved changes. E2 may prompt before publish. */
  readonly hasUnsavedChanges: boolean;
}

/**
 * Input-schema snippet metadata. The authoring workspace offers a snippet that
 * inserts a workflow-level inline `input.schema.document` and briefly explains its
 * effect on the later Run form.
 */
export interface InputSchemaSnippet {
  readonly label: string;
  readonly description: string;
  readonly yaml: string;
}

export const INPUT_SCHEMA_SNIPPET: InputSchemaSnippet = {
  label: "Add input schema",
  description:
    "Inserts a workflow-level input.schema.document. The Run form will generate fields for supported JSON Schema types (object, primitives, arrays, enums). Advanced shapes or external references require raw JSON input.",
  yaml: `input:
  schema:
    document:
      type: object
      properties:
        exampleField:
          type: string
          description: Example input field
      required:
        - exampleField
`,
};
