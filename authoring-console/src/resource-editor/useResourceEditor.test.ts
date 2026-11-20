/**
 * Tests for useResourceEditor hook.
 *
 * Cover: dry-run, create, update, 409 conflict handling, admission errors,
 * field updates preserving advanced fields, invalid YAML.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { KubeObject, ResourceRef } from "../contracts/index.ts";
import { createFixtureKubernetesTransport } from "../fixtures/transports/kubernetes.ts";
import { useResourceEditor } from "./useResourceEditor.ts";

describe("useResourceEditor", () => {
  const ref: ResourceRef = {
    gvk: { group: "", version: "v1", kind: "Namespace" },
    name: "test-namespace",
  };

  const seed: KubeObject = {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: { name: "test-namespace" },
  };

  it("initializes with form mode and parsed draft", () => {
    const transport = createFixtureKubernetesTransport();
    const { result } = renderHook(() =>
      useResourceEditor({ transport, ref, seed, verb: "create" }),
    );

    expect(result.current.state.mode).toBe("form");
    expect(result.current.state.draft.invalid).toBe(false);
    expect(result.current.state.draft.object?.kind).toBe("Namespace");
    expect(result.current.state.verb).toBe("create");
  });

  it("strips server-managed fields from seed", () => {
    const seedWithManagedFields: KubeObject = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        name: "test",
        resourceVersion: "12345",
        generation: 1,
        uid: "abc-123",
        creationTimestamp: "2026-11-20T10:00:00Z",
      },
      status: { phase: "Active" },
    };

    const transport = createFixtureKubernetesTransport();
    const { result } = renderHook(() =>
      useResourceEditor({ transport, ref, seed: seedWithManagedFields, verb: "update" }),
    );

    expect(result.current.state.draft.object?.metadata.resourceVersion).toBeUndefined();
    expect(result.current.state.draft.object?.metadata.generation).toBeUndefined();
    expect(result.current.state.draft.object).not.toHaveProperty("status");
    // But resourceVersion is held separately for the update
    expect(result.current.state.resourceVersion).toBe("12345");
  });

  it("switches mode", () => {
    const transport = createFixtureKubernetesTransport();
    const { result } = renderHook(() =>
      useResourceEditor({ transport, ref, seed, verb: "create" }),
    );

    act(() => {
      result.current.setMode("yaml");
    });

    expect(result.current.state.mode).toBe("yaml");
  });

  it("updates fields and preserves advanced fields", () => {
    const advancedSeed: KubeObject<{ field1: string; advancedField: string }> = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name: "test", namespace: "default" },
      spec: { field1: "original", advancedField: "preserved" },
    };

    const transport = createFixtureKubernetesTransport();
    const { result } = renderHook(() =>
      useResourceEditor({
        transport,
        ref: { ...ref, gvk: { ...ref.gvk, kind: "ConfigMap" } },
        seed: advancedSeed,
        verb: "create",
      }),
    );

    act(() => {
      result.current.updateFields([{ path: "spec.field1", value: "updated" }]);
    });

    expect(result.current.state.draft.object?.spec?.field1).toBe("updated");
    expect(result.current.state.draft.object?.spec?.advancedField).toBe("preserved");
  });

  it("updates YAML text", () => {
    const transport = createFixtureKubernetesTransport();
    const { result } = renderHook(() =>
      useResourceEditor({ transport, ref, seed, verb: "create" }),
    );

    const newYaml = `apiVersion: v1
kind: Namespace
metadata:
  name: updated-name
`;

    act(() => {
      result.current.updateYaml(newYaml);
    });

    expect(result.current.state.draft.object?.metadata.name).toBe("updated-name");
    expect(result.current.state.yamlText).toBe(newYaml);
  });

  it("marks invalid YAML as invalid", () => {
    const transport = createFixtureKubernetesTransport();
    const { result } = renderHook(() =>
      useResourceEditor({ transport, ref, seed, verb: "create" }),
    );

    const invalidYaml = `apiVersion: v1
kind: Namespace
metadata:
  name: test
  invalid: [unclosed
`;

    act(() => {
      result.current.updateYaml(invalidYaml);
    });

    expect(result.current.state.draft.invalid).toBe(true);
    expect(result.current.state.draft.object).toBeNull();
    expect(result.current.state.yamlText).toBe(invalidYaml);
  });

  it("performs dry-run successfully", async () => {
    const transport = createFixtureKubernetesTransport();
    const { result } = renderHook(() =>
      useResourceEditor({ transport, ref, seed, verb: "create" }),
    );

    await act(async () => {
      await result.current.dryRun();
    });

    expect(result.current.state.admitted).not.toBeNull();
    expect(result.current.state.errors).toHaveLength(0);
    expect(result.current.state.submitting).toBe(false);
  });

  it("handles forbidden dry-run", async () => {
    const transport = createFixtureKubernetesTransport({ forbidWrites: true });
    const { result } = renderHook(() =>
      useResourceEditor({ transport, ref, seed, verb: "create" }),
    );

    await act(async () => {
      await result.current.dryRun();
    });

    expect(result.current.state.errors).toHaveLength(1);
    expect(result.current.state.errors[0]?.kind).toBe("forbidden");
    expect(result.current.state.submitting).toBe(false);
  });

  it("submits create successfully", async () => {
    const transport = createFixtureKubernetesTransport();
    const { result } = renderHook(() =>
      useResourceEditor({ transport, ref, seed, verb: "create" }),
    );

    let submitted: KubeObject | undefined;
    await act(async () => {
      submitted = await result.current.submit();
    });

    expect(submitted).toBeDefined();
    expect(result.current.state.errors).toHaveLength(0);
  });

  it("handles 409 conflict on update", async () => {
    const updateSeed: KubeObject = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: "test", resourceVersion: "1000" },
    };

    const transport = createFixtureKubernetesTransport({ conflictOnUpdate: true });
    const { result } = renderHook(() =>
      useResourceEditor({ transport, ref, seed: updateSeed, verb: "update" }),
    );

    await act(async () => {
      try {
        await result.current.submit();
      } catch {
        // Expected
      }
    });

    expect(result.current.state.errors).toHaveLength(1);
    expect(result.current.state.errors[0]?.kind).toBe("conflict");
    if (result.current.state.errors[0]?.kind === "conflict") {
      expect(result.current.state.errors[0].latestResourceVersion).toBe("99999");
    }
  });

  it("reloads after conflict", async () => {
    const updateSeed: KubeObject = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: "test-namespace", resourceVersion: "1000" },
    };

    // First, create an object in the fixture store
    const transport = createFixtureKubernetesTransport();
    await transport.create({ object: updateSeed });

    const { result } = renderHook(() =>
      useResourceEditor({ transport, ref, seed: updateSeed, verb: "update" }),
    );

    let reloaded: KubeObject | undefined;
    await act(async () => {
      reloaded = await result.current.reloadAfterConflict();
    });

    expect(reloaded).toBeDefined();
    expect(result.current.state.deployed).toBe(reloaded);
  });

  it("builds candidate with expectedResourceVersion for update", () => {
    const updateSeed: KubeObject = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: "test", resourceVersion: "5000" },
    };

    const transport = createFixtureKubernetesTransport();
    const { result } = renderHook(() =>
      useResourceEditor({ transport, ref, seed: updateSeed, verb: "update" }),
    );

    expect(result.current.state.resourceVersion).toBe("5000");
    expect(result.current.state.verb).toBe("update");
  });

  it("builds candidate without expectedResourceVersion for create", () => {
    const transport = createFixtureKubernetesTransport();
    const { result } = renderHook(() =>
      useResourceEditor({ transport, ref, seed, verb: "create" }),
    );

    expect(result.current.state.resourceVersion).toBeUndefined();
    expect(result.current.state.verb).toBe("create");
  });
});
