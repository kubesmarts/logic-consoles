/**
 * Tests for schema utilities — schema support detection, validation, initialization.
 */
import { describe, it, expect } from "vitest";
import type { WorkflowDocument } from "../../contracts/index.ts";
import { getSupportedInputSchema, validateInput, initializeFormData } from "../schema-utils.ts";
import type { SupportedJsonSchema } from "../types.ts";

describe("getSupportedInputSchema", () => {
  it("returns null when workflow has no input", () => {
    const flow: WorkflowDocument = {
      document: { name: "test", version: "1.0.0", dsl: "1.0.0" },
      do: [],
    };
    expect(getSupportedInputSchema(flow)).toBeNull();
  });

  it("returns null when input.schema has no document", () => {
    const flow = {
      document: { name: "test", version: "1.0.0", dsl: "1.0.0" },
      input: { schema: { resource: "some-external-ref" } },
      do: [],
    } as unknown as WorkflowDocument;
    expect(getSupportedInputSchema(flow)).toBeNull();
  });

  it("returns null when schema.document is not an object type", () => {
    const flow = {
      document: { name: "test", version: "1.0.0", dsl: "1.0.0" },
      input: { schema: { document: { type: "string" } } },
      do: [],
    } as unknown as WorkflowDocument;
    expect(getSupportedInputSchema(flow)).toBeNull();
  });

  it("returns schema for supported object with primitives", () => {
    const flow = {
      document: { name: "test", version: "1.0.0", dsl: "1.0.0" },
      input: {
        schema: {
          document: {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "integer" },
              active: { type: "boolean" },
            },
            required: ["name"],
          },
        },
      },
      do: [],
    } as unknown as WorkflowDocument;

    const schema = getSupportedInputSchema(flow);
    expect(schema).not.toBeNull();
    expect(schema?.type).toBe("object");
    expect(schema?.properties).toHaveProperty("name");
    expect(schema?.required).toContain("name");
  });

  it("returns schema for nested objects", () => {
    const flow = {
      document: { name: "test", version: "1.0.0", dsl: "1.0.0" },
      input: {
        schema: {
          document: {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  name: { type: "string" },
                },
              },
            },
          },
        },
      },
      do: [],
    } as unknown as WorkflowDocument;

    const schema = getSupportedInputSchema(flow);
    expect(schema).not.toBeNull();
    expect(schema?.properties?.user).toHaveProperty("type", "object");
  });

  it("returns schema for arrays", () => {
    const flow = {
      document: { name: "test", version: "1.0.0", dsl: "1.0.0" },
      input: {
        schema: {
          document: {
            type: "object",
            properties: {
              tags: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
      do: [],
    } as unknown as WorkflowDocument;

    const schema = getSupportedInputSchema(flow);
    expect(schema).not.toBeNull();
    expect(schema?.properties?.tags).toHaveProperty("type", "array");
  });
});

describe("validateInput", () => {
  const schema: SupportedJsonSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "integer" },
    },
    required: ["name"],
  };

  it("returns no errors for valid input", () => {
    const errors = validateInput(schema, { name: "Alice", age: 30 });
    expect(errors).toHaveLength(0);
  });

  it("returns error for missing required field", () => {
    const errors = validateInput(schema, { age: 30 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("returns error for wrong type", () => {
    const errors = validateInput(schema, { name: "Alice", age: "not a number" });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("initializeFormData", () => {
  it("initializes string fields to empty string", () => {
    const schema: SupportedJsonSchema = {
      type: "object",
      properties: { name: { type: "string" } },
    };
    const data = initializeFormData(schema);
    expect(data.name).toBe("");
  });

  it("initializes number fields to 0", () => {
    const schema: SupportedJsonSchema = {
      type: "object",
      properties: { age: { type: "integer" } },
    };
    const data = initializeFormData(schema);
    expect(data.age).toBe(0);
  });

  it("initializes boolean fields to false", () => {
    const schema: SupportedJsonSchema = {
      type: "object",
      properties: { active: { type: "boolean" } },
    };
    const data = initializeFormData(schema);
    expect(data.active).toBe(false);
  });

  it("initializes object fields to empty object", () => {
    const schema: SupportedJsonSchema = {
      type: "object",
      properties: { user: { type: "object" } },
    };
    const data = initializeFormData(schema);
    expect(data.user).toEqual({});
  });

  it("initializes array fields to empty array", () => {
    const schema: SupportedJsonSchema = {
      type: "object",
      properties: { tags: { type: "array" } },
    };
    const data = initializeFormData(schema);
    expect(data.tags).toEqual([]);
  });
});
