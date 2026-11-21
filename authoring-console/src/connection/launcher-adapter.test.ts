/**
 * Tests for launcher adapter.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createLauncherAdapter } from "./launcher-adapter.ts";
import type { SessionScopedKey } from "../contracts/index.ts";

describe("createLauncherAdapter", () => {
  const baseUrl = "http://127.0.0.1:8080";
  const sessionKey: SessionScopedKey = {
    sessionId: "test-session",
    contextName: "test-context",
  };

  const getSessionKey = vi.fn(() => sessionKey);

  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  it("creates adapter with both transports", () => {
    const adapter = createLauncherAdapter({ baseUrl, getSessionKey });

    expect(adapter.get).toBeDefined();
    expect(adapter.list).toBeDefined();
    expect(adapter.dryRun).toBeDefined();
    expect(adapter.create).toBeDefined();
    expect(adapter.update).toBeDefined();
    expect(adapter.getTopology).toBeDefined();
    expect(adapter.listDefinitions).toBeDefined();
  });

  it("sends session and context headers on get request", async () => {
    const adapter = createLauncherAdapter({ baseUrl, getSessionKey });
    const mockResponse = {
      ok: true,
      json: vi.fn(() => Promise.resolve({ kind: "test" })),
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    await adapter.get({
      gvk: { group: "logic.kubesmarts.org", version: "v1", kind: "LogicFlowRuntime" },
      name: "test-runtime",
      namespace: "default",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/k8s/get"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Session-Id": "test-session",
          "X-Context-Name": "test-context",
        }),
      })
    );
  });

  it("sends POST to launcher API for list request", async () => {
    const adapter = createLauncherAdapter({ baseUrl, getSessionKey });
    const mockResponse = {
      ok: true,
      json: vi.fn(() => Promise.resolve({ items: [] })),
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    await adapter.list(
      { group: "logic.kubesmarts.org", version: "v1", kind: "LogicFlowDefinition" },
      { namespace: "default" }
    );

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/k8s/list"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Session-Id": "test-session",
          "X-Context-Name": "test-context",
        }),
      })
    );
  });

  it("throws error when session mismatch (409)", async () => {
    const adapter = createLauncherAdapter({ baseUrl, getSessionKey });
    const mockResponse = {
      ok: false,
      status: 409,
      json: vi.fn(() => Promise.resolve({ error: "Session mismatch" })),
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    await expect(
      adapter.get({
        gvk: { group: "", version: "v1", kind: "Namespace" },
        name: "default",
      })
    ).rejects.toThrow("Session or context changed");
  });

  it("calls gateway topology endpoint", async () => {
    const adapter = createLauncherAdapter({ baseUrl, getSessionKey });
    const mockResponse = {
      ok: true,
      json: vi.fn(() => Promise.resolve({ nodes: [], edges: [], discovery: { partial: false, warnings: [] } })),
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    await adapter.getTopology("default");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/gateway/topology?namespace=default"),
      expect.any(Object)
    );
  });

  it("calls gateway execute endpoint with link and input", async () => {
    const adapter = createLauncherAdapter({ baseUrl, getSessionKey });
    const mockResponse = {
      ok: true,
      json: vi.fn(() => Promise.resolve({ instanceId: "inst-123", raw: {} })),
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    const link = { href: "/v1/runtime/ns/name/1.0.0", method: "POST", operationId: "execute" };
    await adapter.execute(link, { input: "data" });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/gateway/execute"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("href"),
      })
    );
  });
});
