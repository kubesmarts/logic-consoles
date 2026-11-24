import { afterEach, describe, expect, it, vi } from "vitest";
import { createDirectBrowserAdapter } from "./direct-browser-adapter.ts";
import { createCapabilityTransport } from "./capability-transport.ts";

const adapter = createDirectBrowserAdapter({
  k8sApiUrl: "https://kube.example",
  token: "example",
  gatewayUrl: "",
});
describe("direct Kubernetes requests", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("sends a cluster-scoped SelfSubjectAccessReview with the user's token", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ status: { allowed: true } }));
    vi.stubGlobal("fetch", fetch);
    const answer = await createCapabilityTransport(adapter).canI({
      group: "",
      resource: "namespaces",
      verb: "create",
    });
    expect(answer.decision).toBe("allowed");
    expect(fetch).toHaveBeenCalledWith(
      "https://kube.example/apis/authorization.k8s.io/v1/selfsubjectaccessreviews",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        headers: expect.objectContaining({ Authorization: "Bearer example" }),
      }),
    );
  });
  it("keeps a Kubernetes write conflict distinct from a changed launcher session", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: "stale" }, { status: 409 }),
        ),
    );
    const object = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: "demo", resourceVersion: "1" },
    };
    await expect(
      adapter.update({ object, expectedResourceVersion: "1" }),
    ).rejects.toMatchObject({ status: 409, writeError: { kind: "conflict" } });
  });
});

it("restores the separately reviewed resourceVersion for direct dry-run and update", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({}));
  vi.stubGlobal("fetch", fetch);
  const object = {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: { name: "demo" },
  };
  try {
    await adapter.dryRun({ object, expectedResourceVersion: "7" }, "update");
    expect(
      JSON.parse(fetch.mock.calls[0]?.[1].body).metadata.resourceVersion,
    ).toBe("7");
  } finally {
    vi.unstubAllGlobals();
  }
});
