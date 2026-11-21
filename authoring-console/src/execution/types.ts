/**
 * Execution module types — schema-driven forms, execution modes, lifecycle.
 */

/** JSON Schema subset supported by the schema-driven form builder. */
export interface SupportedJsonSchema {
  readonly type: "object";
  readonly properties?: Record<string, JsonSchemaProperty>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

export type JsonSchemaProperty =
  | { readonly type: "string"; readonly enum?: readonly string[] }
  | { readonly type: "number" }
  | { readonly type: "integer" }
  | { readonly type: "boolean" }
  | { readonly type: "object"; readonly properties?: Record<string, JsonSchemaProperty>; readonly required?: readonly string[] }
  | { readonly type: "array"; readonly items?: JsonSchemaProperty };

/** Input mode: schema-driven form vs raw JSON. */
export type InputMode = "form" | "json";

/** Execution mode: sync (run and wait) vs async (start in background). */
export type ExecutionMode = "sync" | "async";

/** Run panel state. */
export interface RunState {
  readonly inputMode: InputMode;
  readonly executionMode: ExecutionMode;
  readonly formData: Record<string, unknown>;
  readonly jsonInput: string;
  readonly isExecuting: boolean;
  readonly result: ExecutionResult | null;
  readonly error: string | null;
}

/** Execution result — either sync output or async instance ID. */
export type ExecutionResult =
  | { readonly mode: "sync"; readonly output: unknown; readonly raw: unknown }
  | { readonly mode: "async"; readonly instanceId: string; readonly raw: unknown };

/** Instance lifecycle action. */
export type InstanceAction = "suspend" | "resume" | "cancel";

/** Instance lifecycle state. */
export interface LifecycleState {
  readonly instanceId: string;
  readonly isActing: boolean;
  readonly actingOn: InstanceAction | null;
  readonly result: InstanceActionOutcome | null;
  readonly error: string | null;
}

export interface InstanceActionOutcome {
  readonly action: InstanceAction;
  readonly httpStatus: number;
  readonly raw: unknown;
}
