/**
 * Tests for YAML document utilities.
 *
 * Cover: server-managed field stripping, advanced field preservation, path-level
 * updates, invalid YAML handling.
 */
import { describe, it, expect } from "vitest";
import type { KubeObject } from "../contracts/index.ts";
import {
  createDraftFromObject,
  parseYamlText,
  updateFieldInDocument,
  applyFieldUpdates,
  getFieldFromDocument,
} from "./yaml-utils.ts";

describe("createDraftFromObject", () => {
  it("strips server-managed metadata fields", () => {
    const object: KubeObject = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        name: "test",
        resourceVersion: "12345",
        generation: 1,
        uid: "abc-123",
        creationTimestamp: "2026-11-20T10:00:00Z",
      },
    };

    const draft = createDraftFromObject(object);
    expect(draft.invalid).toBe(false);
    expect(draft.object?.metadata.resourceVersion).toBeUndefined();
    expect(draft.object?.metadata.generation).toBeUndefined();
    expect(draft.object?.metadata.uid).toBeUndefined();
    expect(draft.object?.metadata.creationTimestamp).toBeUndefined();
    expect(draft.object?.metadata.name).toBe("test");
  });

  it("strips status field", () => {
    const object: KubeObject<unknown, { ready: boolean }> = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: "test" },
      status: { ready: true },
    };

    const draft = createDraftFromObject(object);
    expect(draft.object).not.toHaveProperty("status");
  });

  it("preserves annotations and labels", () => {
    const object: KubeObject = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        name: "test",
        annotations: { "app.example/owner": "team-a" },
        labels: { environment: "production" },
      },
    };

    const draft = createDraftFromObject(object);
    expect(draft.object?.metadata.annotations).toEqual({ "app.example/owner": "team-a" });
    expect(draft.object?.metadata.labels).toEqual({ environment: "production" });
  });

  it("preserves advanced spec fields", () => {
    const object: KubeObject<{ replicas: number; advancedField: string }> = {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name: "test", namespace: "default" },
      spec: {
        replicas: 3,
        advancedField: "preserved-value",
      },
    };

    const draft = createDraftFromObject(object);
    expect(draft.object?.spec?.replicas).toBe(3);
    expect(draft.object?.spec?.advancedField).toBe("preserved-value");
  });
});

describe("parseYamlText", () => {
  it("parses valid YAML", () => {
    const yaml = `apiVersion: v1
kind: Namespace
metadata:
  name: test
`;
    const draft = parseYamlText(yaml);
    expect(draft.invalid).toBe(false);
    expect(draft.object?.kind).toBe("Namespace");
    expect(draft.object?.metadata.name).toBe("test");
  });

  it("marks invalid YAML as invalid", () => {
    const yaml = `apiVersion: v1
kind: Namespace
metadata:
  name: test
  invalid: [unclosed array
`;
    const draft = parseYamlText(yaml);
    expect(draft.invalid).toBe(true);
    expect(draft.object).toBeNull();
  });

  it("marks incomplete object as invalid", () => {
    const yaml = `justAString: true`;
    const draft = parseYamlText(yaml);
    expect(draft.invalid).toBe(true);
    expect(draft.object).toBeNull();
  });
});

describe("updateFieldInDocument", () => {
  it("updates a simple field", () => {
    const object: KubeObject = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: "old-name" },
    };
    const draft = createDraftFromObject(object);

    updateFieldInDocument(draft.document, { path: "metadata.name", value: "new-name" });
    const updated = draft.document.toJSON() as KubeObject;
    expect(updated.metadata.name).toBe("new-name");
  });

  it("updates a nested field", () => {
    const object: KubeObject<{ runtimeRef: { name: string } }> = {
      apiVersion: "logic.kubesmarts.org/v1",
      kind: "LogicFlowDefinition",
      metadata: { name: "test", namespace: "default" },
      spec: { runtimeRef: { name: "old-runtime" } },
    };
    const draft = createDraftFromObject(object);

    updateFieldInDocument(draft.document, {
      path: "spec.runtimeRef.name",
      value: "new-runtime",
    });
    const updated = draft.document.toJSON() as typeof object;
    expect(updated.spec?.runtimeRef.name).toBe("new-runtime");
  });

  it("creates intermediate objects when missing", () => {
    const object: KubeObject = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: "test" },
    };
    const draft = createDraftFromObject(object);

    updateFieldInDocument(draft.document, { path: "spec.newField.value", value: 42 });
    const updated = draft.document.toJSON() as KubeObject<{ newField: { value: number } }>;
    expect(updated.spec?.newField.value).toBe(42);
  });

  it("deletes field when value is undefined", () => {
    const object: KubeObject<{ field1: string; field2: string }> = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name: "test" },
      spec: { field1: "keep", field2: "delete" },
    };
    const draft = createDraftFromObject(object);

    updateFieldInDocument(draft.document, { path: "spec.field2", value: undefined });
    const updated = draft.document.toJSON() as typeof object;
    expect(updated.spec?.field1).toBe("keep");
    expect(updated.spec?.field2).toBeUndefined();
  });

  it("preserves other fields when updating", () => {
    const object: KubeObject<{ field1: string; field2: string; advanced: string }> = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name: "test" },
      spec: { field1: "value1", field2: "value2", advanced: "preserved" },
    };
    const draft = createDraftFromObject(object);

    updateFieldInDocument(draft.document, { path: "spec.field1", value: "updated" });
    const updated = draft.document.toJSON() as typeof object;
    expect(updated.spec?.field1).toBe("updated");
    expect(updated.spec?.field2).toBe("value2");
    expect(updated.spec?.advanced).toBe("preserved");
  });
});

describe("applyFieldUpdates", () => {
  it("applies multiple updates in order", () => {
    const object: KubeObject<{ a: number; b: number; c: number }> = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name: "test" },
      spec: { a: 1, b: 2, c: 3 },
    };
    const draft = createDraftFromObject(object);

    applyFieldUpdates(draft.document, [
      { path: "spec.a", value: 10 },
      { path: "spec.b", value: 20 },
      { path: "spec.c", value: undefined },
    ]);

    const updated = draft.document.toJSON() as typeof object;
    expect(updated.spec?.a).toBe(10);
    expect(updated.spec?.b).toBe(20);
    expect(updated.spec?.c).toBeUndefined();
  });
});

describe("getFieldFromDocument", () => {
  it("retrieves a simple field", () => {
    const object: KubeObject = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: "test" },
    };
    const draft = createDraftFromObject(object);

    const value = getFieldFromDocument(draft.document, "metadata.name");
    expect(value).toBe("test");
  });

  it("retrieves a nested field", () => {
    const object: KubeObject<{ runtimeRef: { name: string } }> = {
      apiVersion: "logic.kubesmarts.org/v1",
      kind: "LogicFlowDefinition",
      metadata: { name: "test", namespace: "default" },
      spec: { runtimeRef: { name: "my-runtime" } },
    };
    const draft = createDraftFromObject(object);

    const value = getFieldFromDocument(draft.document, "spec.runtimeRef.name");
    expect(value).toBe("my-runtime");
  });

  it("returns undefined for missing field", () => {
    const object: KubeObject = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: "test" },
    };
    const draft = createDraftFromObject(object);

    const value = getFieldFromDocument(draft.document, "spec.missing.field");
    expect(value).toBeUndefined();
  });
});

describe("YAML round-trip with advanced fields", () => {
  it("preserves advanced pod field across form update", () => {
    const object: KubeObject<{
      replicas: number;
      template: { spec: { containers: unknown[]; advancedPodField: string } };
    }> = {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name: "test", namespace: "default" },
      spec: {
        replicas: 2,
        template: {
          spec: {
            containers: [{ name: "app", image: "example:1.0" }],
            advancedPodField: "user-configured-value",
          },
        },
      },
    };

    const draft = createDraftFromObject(object);
    // Simulate form update: change replicas
    updateFieldInDocument(draft.document, { path: "spec.replicas", value: 3 });

    const updated = draft.document.toJSON() as typeof object;
    expect(updated.spec?.replicas).toBe(3);
    expect(updated.spec?.template.spec.advancedPodField).toBe("user-configured-value");
  });
});
