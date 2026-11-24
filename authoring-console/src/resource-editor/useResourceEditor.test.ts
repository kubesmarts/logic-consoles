/**
 * Tests for useResourceEditor hook.
 *
 * Cover: dry-run, create, update, 409 conflict handling, admission errors,
 * field updates preserving advanced fields, invalid YAML.
 */
import { describe, it, expect, vi } from "vitest";
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

  it("polls past a pending generation and transient read failure until the operator is ready", async () => {
    vi.useFakeTimers();
    try {
      const get = vi.fn().mockResolvedValueOnce({ ...seed, metadata: { ...seed.metadata, generation: 2 }, status: { observedGeneration: 2, phase: "Pending" } })
        .mockRejectedValueOnce(new Error("Unavailable"))
        .mockResolvedValue({ ...seed, metadata: { ...seed.metadata, generation: 2 }, status: { observedGeneration: 2, phase: "Ready" } });
      const transport = { ...createFixtureKubernetesTransport(), get, watchStatus: undefined };
      const { result, unmount } = renderHook(() => useResourceEditor({ transport, ref, seed, verb: "create" }));
      await act(async () => result.current.startReconciliation(seed));
      expect(result.current.reconciliation?.reconciled).toBe(false);
      await act(async () => vi.advanceTimersByTimeAsync(4000));
      expect(result.current.reconciliation?.reconciled).toBe(true);
      await act(async () => vi.advanceTimersByTimeAsync(4000));
      expect(get).toHaveBeenCalledTimes(3);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

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

  // Review fix #1: Diff computation on update path
  it("computes deployed-to-draft diff on update path", () => {
    const deployedObject: KubeObject<{ replicas: number; image: string }> = {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name: "test", namespace: "default", resourceVersion: "1000" },
      spec: { replicas: 2, image: "original:1.0" },
    };

    const updateSeed: KubeObject<{ replicas: number; image: string }> = {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name: "test", namespace: "default", resourceVersion: "1000" },
      spec: { replicas: 2, image: "original:1.0" },
    };

    const transport = createFixtureKubernetesTransport();
    const { result } = renderHook(() =>
      useResourceEditor({
        transport,
        ref: { ...ref, gvk: { ...ref.gvk, kind: "Deployment" } },
        seed: updateSeed,
        verb: "update",
        deployed: deployedObject,
      }),
    );

    // Initially, no diff (deployed == draft)
    expect(result.current.state.diff).not.toBeNull();
    expect(result.current.state.diff?.changed).toHaveLength(0);

    // Update a field
    act(() => {
      result.current.updateFields([{ path: "spec.replicas", value: 3 }]);
    });

    // Diff should now show the change
    expect(result.current.state.diff).not.toBeNull();
    expect(result.current.state.diff?.changed.length).toBeGreaterThan(0);
    const replicaDiff = result.current.state.diff?.changed.find((d) => d.path === "spec.replicas");
    expect(replicaDiff?.deployed).toBe(2);
    expect(replicaDiff?.draft).toBe(3);
  });

  // Review fix #2: lastValidObject preserved when YAML becomes invalid
  it("preserves lastValidObject when YAML becomes invalid", () => {
    const transport = createFixtureKubernetesTransport();
    const { result } = renderHook(() =>
      useResourceEditor({ transport, ref, seed, verb: "create" }),
    );

    // Initially valid
    expect(result.current.state.draft.invalid).toBe(false);
    expect(result.current.state.draft.object?.metadata.name).toBe("test-namespace");
    expect(result.current.state.draft.lastValidObject?.metadata.name).toBe("test-namespace");

    // Update to invalid YAML
    const invalidYaml = `apiVersion: v1
kind: Namespace
metadata:
  name: test
  invalid: [unclosed
`;

    act(() => {
      result.current.updateYaml(invalidYaml);
    });

    // Now invalid, but lastValidObject preserved
    expect(result.current.state.draft.invalid).toBe(true);
    expect(result.current.state.draft.object).toBeNull();
    expect(result.current.state.draft.lastValidObject?.metadata.name).toBe("test-namespace");
  });

  // Review fix #3: Line diagnostics for invalid YAML
  it("includes line diagnostics for invalid YAML", () => {
    const transport = createFixtureKubernetesTransport();
    const { result } = renderHook(() =>
      useResourceEditor({ transport, ref, seed, verb: "create" }),
    );

    // Update to invalid YAML
    const invalidYaml = `apiVersion: v1
kind: Namespace
metadata:
  name: test
  invalid: [unclosed
`;

    act(() => {
      result.current.updateYaml(invalidYaml);
    });

    // Should have diagnostics
    expect(result.current.state.draft.diagnostics.length).toBeGreaterThan(0);
  });

  // Review fix #4: Rapid double-dry-run uses current draft (concurrency bug fix)
  it("handles rapid double-dry-run with current draft state", async () => {
    const transport = createFixtureKubernetesTransport();
    const { result } = renderHook(() =>
      useResourceEditor({ transport, ref, seed, verb: "create" }),
    );

    // Update the draft
    act(() => {
      result.current.updateFields([{ path: "metadata.name", value: "updated-name" }]);
    });

    // Trigger two dry-runs in rapid succession
    const dryRun1 = act(async () => {
      await result.current.dryRun();
    });

    const dryRun2 = act(async () => {
      await result.current.dryRun();
    });

    await Promise.all([dryRun1, dryRun2]);

    // Both should succeed without error (no stale state used)
    expect(result.current.state.errors).toHaveLength(0);
    expect(result.current.state.admitted).not.toBeNull();
    expect(result.current.state.admitted?.metadata.name).toBe("updated-name");
  });
});
