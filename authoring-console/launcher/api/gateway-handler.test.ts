/**
 * Tests for gateway handlers - focusing on template substitution and SSRF prevention.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleInstanceAction, handleExecute, handleExecuteSync } from "./gateway-handler.js";
import type { GatewayClientConfig } from "../gateway-client.js";

describe("handleInstanceAction - template substitution", () => {
  const config: GatewayClientConfig = {
    baseUrl: "http://gateway.example.com",
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("CRITICAL: substitutes {id} template correctly and validates", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "suspended" }),
    } as Response);

    const linkHref = "/v1/runtime/ns/name/1.0.0/instance/{id}/suspend";
    const instanceId = "inst-12345";

    const result = await handleInstanceAction(config, linkHref, instanceId);

    expect(result).toEqual({
      instanceId: "inst-12345",
      httpStatus: 200,
      raw: { status: "suspended" },
    });

    // Verify fetch was called with the substituted path
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/v1/runtime/ns/name/1.0.0/instance/inst-12345/suspend"),
      expect.any(Object)
    );

    fetchSpy.mockRestore();
  });

  it("CRITICAL: encodeURIComponent on instanceId prevents path injection", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "suspended" }),
    } as Response);

    const linkHref = "/v1/runtime/ns/name/1.0.0/instance/{id}/suspend";
    // Malicious instanceId trying to inject path segments
    const maliciousId = "../../../evil";

    await handleInstanceAction(config, linkHref, maliciousId);

    // Verify the malicious characters were encoded, not interpreted
    const callUrl = fetchSpy.mock.calls[0]?.[0] as string;
    expect(callUrl).toContain("..%2F..%2F..%2Fevil"); // Encoded
    expect(callUrl).not.toContain("../../../"); // Not decoded

    fetchSpy.mockRestore();
  });

  it("CRITICAL: rejects absolute URL in linkHref (SSRF prevention)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    const maliciousHref = "http://evil.example/steal/{id}";
    const instanceId = "inst-12345";

    // The handler catches the validation error and maps it to GatewayError
    await expect(handleInstanceAction(config, maliciousHref, instanceId)).rejects.toMatchObject({
      kind: "unreachable",
    });

    // Verify fetch was NEVER called
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("works with resume action", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "running" }),
    } as Response);

    const linkHref = "/v1/runtime/ns/name/1.0.0/instance/{id}/resume";
    const instanceId = "inst-67890";

    const result = await handleInstanceAction(config, linkHref, instanceId);

    expect(result.instanceId).toBe("inst-67890");
    expect(result.httpStatus).toBe(200);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/v1/runtime/ns/name/1.0.0/instance/inst-67890/resume"),
      expect.any(Object)
    );

    fetchSpy.mockRestore();
  });

  it("works with cancel action", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "cancelled" }),
    } as Response);

    const linkHref = "/v1/runtime/ns/name/1.0.0/instance/{id}/cancel";
    const instanceId = "inst-99999";

    const result = await handleInstanceAction(config, linkHref, instanceId);

    expect(result.instanceId).toBe("inst-99999");
    expect(result.httpStatus).toBe(200);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/v1/runtime/ns/name/1.0.0/instance/inst-99999/cancel"),
      expect.any(Object)
    );

    fetchSpy.mockRestore();
  });
});

describe("handleExecute and handleExecuteSync - SSRF prevention", () => {
  const config: GatewayClientConfig = {
    baseUrl: "http://gateway.example.com",
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("CRITICAL: handleExecute rejects absolute URL", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    const maliciousHref = "http://evil.example/steal-data";
    const input = { data: "test" };

    // The handler catches the validation error and maps it to GatewayError
    await expect(handleExecute(config, maliciousHref, input)).rejects.toMatchObject({
      kind: "unreachable",
    });

    // Verify fetch was NEVER called
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("CRITICAL: handleExecuteSync rejects absolute URL", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    const maliciousHref = "http://evil.example/steal-data";
    const input = { data: "test" };

    // The handler catches the validation error and maps it to GatewayError
    await expect(handleExecuteSync(config, maliciousHref, input)).rejects.toMatchObject({
      kind: "unreachable",
    });

    // Verify fetch was NEVER called
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("handleExecute accepts legitimate gateway href", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ instanceId: "inst-123", workflowApplicationId: "app-456" }),
    } as Response);

    const href = "/v1/runtime/ns/name/1.0.0";
    const input = { name: "test" };

    const result = await handleExecute(config, href, input);

    expect(result).toEqual({ instanceId: "inst-123", workflowApplicationId: "app-456", raw: { instanceId: "inst-123", workflowApplicationId: "app-456" } });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/v1/runtime/ns/name/1.0.0"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
      })
    );

    fetchSpy.mockRestore();
  });

  it("handleExecuteSync accepts legitimate gateway href", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ workflowdata: { result: "success" } }),
    } as Response);

    const href = "/v1/runtime/ns/name/1.0.0/sync";
    const input = { name: "test" };

    const result = await handleExecuteSync(config, href, input);

    expect(result).toEqual({ output: { result: "success" }, raw: { workflowdata: { result: "success" } } });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/v1/runtime/ns/name/1.0.0/sync"),
      expect.objectContaining({
        method: "POST",
      })
    );

    fetchSpy.mockRestore();
  });
});
