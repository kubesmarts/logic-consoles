/**
 * JSON Schema utilities for input validation and form support detection.
 *
 * Supported subset: objects, required properties, primitives (string/number/integer/boolean),
 * nested objects, arrays, and enums on string fields. External schema resources and
 * unsupported dialects fall back to raw JSON input.
 */
import Ajv from "ajv";
import type { WorkflowDocument } from "../contracts/index.ts";
import type { SupportedJsonSchema, JsonSchemaProperty } from "./types.ts";

/**
 * Check if a workflow has an inline input schema that we can render as a form.
 * Returns the schema if supported, or null if the workflow should use raw JSON input.
 */
export const getSupportedInputSchema = (flow: WorkflowDocument): SupportedJsonSchema | null => {
  // Check for input.schema.document (inline schema)
  const inputSchema = (flow as Record<string, unknown>)?.input as Record<string, unknown> | undefined;
  if (!inputSchema) return null;

  const schema = inputSchema?.schema as Record<string, unknown> | undefined;
  if (!schema) return null;

  // If schema.resource is set, it's an external reference — not supported
  if (schema.resource) return null;

  // We need schema.document
  const document = schema.document as unknown;
  if (!document || typeof document !== "object") return null;

  // Basic validation: must be an object schema
  const schemaDoc = document as Record<string, unknown>;
  if (schemaDoc.type !== "object") return null;

  // Check if all properties are supported types
  const properties = schemaDoc.properties as Record<string, unknown> | undefined;
  if (properties && !isPropertiesSupported(properties)) return null;

  return document as SupportedJsonSchema;
};

/** Check if all properties use supported JSON Schema types. */
const isPropertiesSupported = (properties: Record<string, unknown>): boolean => {
  for (const prop of Object.values(properties)) {
    if (!isPropertySupported(prop)) return false;
  }
  return true;
};

/** Check if a single property is a supported type. */
const isPropertySupported = (prop: unknown): boolean => {
  if (!prop || typeof prop !== "object") return false;
  const p = prop as Record<string, unknown>;
  const type = p.type;

  // Primitives
  if (type === "string" || type === "number" || type === "integer" || type === "boolean") {
    return true;
  }

  // Nested object
  if (type === "object") {
    const nestedProps = p.properties as Record<string, unknown> | undefined;
    if (nestedProps && !isPropertiesSupported(nestedProps)) return false;
    return true;
  }

  // Array
  if (type === "array") {
    const items = p.items as unknown;
    if (items && !isPropertySupported(items)) return false;
    return true;
  }

  return false;
};

/**
 * Create an Ajv validator for the supported JSON Schema dialect.
 * Uses draft-07 as the baseline.
 */
export const createSchemaValidator = (schema: SupportedJsonSchema) => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  return validate;
};

/**
 * Validate input data against a schema. Returns an array of error messages,
 * or an empty array if valid.
 */
export const validateInput = (
  schema: SupportedJsonSchema,
  data: unknown,
): readonly string[] => {
  const validate = createSchemaValidator(schema);
  const valid = validate(data);

  if (valid) return [];

  return (validate.errors || []).map((err) => {
    const path = err.instancePath || "/";
    const message = err.message || "validation error";
    return `${path}: ${message}`;
  });
};

/**
 * Initialize form data from a schema with default values.
 * - Objects: empty object {}
 * - Arrays: empty array []
 * - Strings: ""
 * - Numbers/integers: 0
 * - Booleans: false
 */
export const initializeFormData = (schema: SupportedJsonSchema): Record<string, unknown> => {
  const data: Record<string, unknown> = {};
  if (!schema.properties) return data;

  for (const [key, prop] of Object.entries(schema.properties)) {
    data[key] = getDefaultValue(prop);
  }

  return data;
};

const getDefaultValue = (prop: JsonSchemaProperty): unknown => {
  switch (prop.type) {
    case "string":
      return "";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    case "object":
      return {};
    case "array":
      return [];
    default:
      return null;
  }
};
