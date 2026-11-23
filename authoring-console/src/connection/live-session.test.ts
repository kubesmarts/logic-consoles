import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectDirect,
  connectLauncher,
  findLauncher,
} from "./live-session.ts";

const kinds = [
  "ClusterLogicPlatform",
  "LogicFlowRuntime",
  "LogicFlowDefinition",
  "LogicFlowService",
];
const apiResponse = () =>
  Response.json({
    resources: kinds.map((kind) => ({ kind, name: kind.toLowerCase() + "s" })),
  });
const launcher = {
  mode: "launcher" as const,
  sessionId: "before",
  context: { contextName: "kind-demo", clusterDisplay: "kind" },
  namespace: null,
  gatewayUrl: null,
};

describe("connecting a real browser session", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("keeps hosted traffic inside the selected network and works without a gateway", async () => {
    const fetch = vi.fn(async () => apiResponse());
    vi.stubGlobal("fetch", fetch);
    expect(await findLauncher("console.example")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    const result = await connectDirect(
      { k8sApiUrl: "https://api.example", gatewayUrl: "", token: "test" },
      "demo",
    );
    expect(result.installation.kind).toBe("installed");
    expect(result.gatewayStatus).toBe("No gateway configured");
    expect(result.services.session.namespace).toBe("demo");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example/apis/logic.kubesmarts.org/v1",
      expect.objectContaining({ headers: { Authorization: "Bearer test" } }),
    );
  });
  it("distinguishes denied discovery from absent APIs and rejects invalid credentials", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    const config = {
      k8sApiUrl: "https://api.example",
      gatewayUrl: "",
      token: "test",
    };
    expect((await connectDirect(config, "demo")).installation.kind).toBe(
      "forbidden-discovery",
    );
    await expect(connectDirect(config, "demo")).rejects.toThrow(/401/);
  });
  it("confirms a launcher context then uses the rotated session for discovery", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ...launcher, sessionId: "after" }))
      .mockResolvedValueOnce(apiResponse());
    vi.stubGlobal("fetch", fetch);
    const result = await connectLauncher(launcher, "kind-demo", "demo", "");
    expect(result.services.session.sessionId).toBe("after");
    expect(fetch.mock.calls[0]?.[1]?.headers["X-Session-Id"]).toBe("before");
    expect(fetch.mock.calls[1]?.[1]?.headers["X-Session-Id"]).toBe("after");
  });
});

it("invalidates pending and future hosted requests on disconnect", async () => {
  const fetch = vi.fn().mockResolvedValue(apiResponse());
  vi.stubGlobal("fetch", fetch);
  try {
    const session = await connectDirect(
      { k8sApiUrl: "https://api.example", gatewayUrl: "", token: "test" },
      "demo",
    );
    session.close?.();
    const ref = {
      gvk: { group: "", kind: "Namespace", version: "v1" },
      name: "demo",
    };
    await expect(session.services.kubernetes.get(ref)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
