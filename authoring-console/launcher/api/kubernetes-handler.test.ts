import { describe, expect, it, vi } from "vitest";
import type { K8sClientContext } from "../kubernetes-client.js";
import { handleList, handleWrite } from "./kubernetes-handler.js";

const candidate = {
  apiVersion: "logic.kubesmarts.org/v1", kind: "LogicFlowDefinition",
  metadata: { name: "authored", namespace: "demo" }, spec: { flow: {} },
};

describe("Kubernetes launcher wire contract", () => {
  it.each([true, false])("applies the separate concurrency token during replacement (dryRun=%s)", async dryRun => {
    const replace = vi.fn().mockResolvedValue(candidate);
    const client = { customApi: { replaceNamespacedCustomObject: replace } } as unknown as K8sClientContext;
    await handleWrite(client, { verb: "update", object: candidate, expectedResourceVersion: "57", dryRun });
    expect(replace).toHaveBeenCalledWith(expect.objectContaining({
      dryRun: dryRun ? "All" : undefined,
      body: { ...candidate, metadata: { ...candidate.metadata, resourceVersion: "57" } },
    }));
    expect(candidate.metadata).not.toHaveProperty("resourceVersion");
  });

  it("preserves field errors from Kubernetes client ApiException", async () => {
    const cause = { field: "spec.flow", message: "Invalid workflow" };
    const create = vi.fn().mockRejectedValue({ code: 422, body: JSON.stringify({ details: { causes: [cause] } }) });
    const client = { customApi: { createNamespacedCustomObject: create } } as unknown as K8sClientContext;
    await expect(handleWrite(client, { verb: "create", object: candidate, dryRun: true })).rejects.toMatchObject({
      status: 422, writeError: { kind: "admission", errors: [{ path: cause.field, message: cause.message }] },
    });
  });

  it("projects pod observations and preserves selectors and pagination", async () => {
    const list = vi.fn().mockResolvedValue({ metadata: { continue: "next" }, items: [{
      metadata: { name: "runner", namespace: "demo", labels: { app: "runner" } },
      spec: { containers: [{ name: "runner", image: "runner:test", env: [{ name: "PRIVATE" }] }] },
      status: { containerStatuses: [{ name: "runner", image: "runner:test", imageID: "runner@sha256:abc" }] },
    }] });
    const client = { coreApi: { listPodForAllNamespaces: list } } as unknown as K8sClientContext;
    const result = await handleList(client, { gvk: { group: "", version: "v1", kind: "Pod" }, labelSelector: "app=runner", continue: "cursor" });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ labelSelector: "app=runner", _continue: "cursor" }));
    expect(result.items[0].spec.containers).toEqual([{ name: "runner", image: "runner:test" }]);
    expect(result.items[0].status.containerStatuses[0].imageID).toBe("runner@sha256:abc");
    expect(result.metadata.continue).toBe("next");
  });
});
