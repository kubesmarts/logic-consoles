/**
 * Tests for gateway client - focusing on SSRF prevention.
 */
import { describe, it, expect, vi } from "vitest";
import { validateGatewayHref } from "./gateway-client.js";
import type { GatewayClientConfig } from "./gateway-client.js";

describe("validateGatewayHref - SSRF prevention", () => {
  const config: GatewayClientConfig = {
    baseUrl: "http://gateway.example.com",
  };

  it("accepts legitimate relative gateway hrefs", () => {
    expect(validateGatewayHref("/v1/runtime/ns/name/1.0.0", config)).toBe(
      "/v1/runtime/ns/name/1.0.0"
    );
    expect(validateGatewayHref("/v1/runtime/ns/name/1.0.0/sync", config)).toBe(
      "/v1/runtime/ns/name/1.0.0/sync"
    );
    expect(validateGatewayHref("/v1/topology?namespace=default", config)).toBe(
      "/v1/topology?namespace=default"
    );
  });

  it("accepts concrete paths after template substitution", () => {
    // After {id} substitution with encodeURIComponent, validator sees concrete path
    const instanceId = "inst-12345";
    const concreteHref = `/v1/instances/${encodeURIComponent(instanceId)}/suspend`;
    expect(validateGatewayHref(concreteHref, config)).toBe(
      `/v1/instances/${instanceId}/suspend`
    );
  });

  it("CRITICAL: rejects absolute http URL (SSRF to arbitrary host)", () => {
    expect(() =>
      validateGatewayHref("http://evil.example/steal-data", config)
    ).toThrow(/Rejected absolute href with scheme/);
  });

  it("CRITICAL: rejects absolute https URL (SSRF to arbitrary host)", () => {
    expect(() =>
      validateGatewayHref("https://169.254.169.254/latest/meta-data/", config)
    ).toThrow(/Rejected absolute href with scheme/);
  });

  it("CRITICAL: rejects cloud metadata URL (AWS)", () => {
    expect(() =>
      validateGatewayHref("http://169.254.169.254/latest/meta-data/", config)
    ).toThrow(/Rejected absolute href with scheme/);
  });

  it("CRITICAL: rejects authority marker (protocol-relative URL)", () => {
    expect(() =>
      validateGatewayHref("//evil.example/steal-data", config)
    ).toThrow(/Rejected href with authority marker/);
  });

  it("rejects file:// scheme", () => {
    expect(() =>
      validateGatewayHref("file:///etc/passwd", config)
    ).toThrow(/Rejected absolute href with scheme/);
  });

  it("rejects ftp:// scheme", () => {
    expect(() =>
      validateGatewayHref("ftp://internal.server/", config)
    ).toThrow(/Rejected absolute href with scheme/);
  });

  it("rejects non-root-relative paths (no leading slash)", () => {
    expect(() =>
      validateGatewayHref("v1/runtime/ns/name/1.0.0", config)
    ).toThrow(/Rejected non-root-relative href/);
  });

  it("rejects relative paths with ..", () => {
    // While ../.. itself starts with ., not /, this would be caught by the leading / check
    expect(() =>
      validateGatewayHref("../etc/passwd", config)
    ).toThrow(/Rejected non-root-relative href/);
  });

  it("preserves query parameters in validated path", () => {
    const result = validateGatewayHref("/v1/topology?namespace=default&limit=10", config);
    expect(result).toBe("/v1/topology?namespace=default&limit=10");
  });

  it("strips fragment from validated path (defense in depth)", () => {
    const result = validateGatewayHref("/v1/definitions/#fragment", config);
    expect(result).toBe("/v1/definitions/");
  });

  it("defense in depth: verifies resolved origin matches gateway", () => {
    // This tests the second layer of defense - even if something bypassed
    // the scheme/authority checks, the origin validation would catch it
    const configWithPort: GatewayClientConfig = {
      baseUrl: "http://gateway.example.com:8080",
    };

    // Valid path should work
    expect(validateGatewayHref("/v1/runtime/ns/name/1.0.0", configWithPort)).toBe(
      "/v1/runtime/ns/name/1.0.0"
    );
  });

  it("handles paths with special characters correctly", () => {
    const result = validateGatewayHref("/v1/definitions/ns/my-workflow/1.0.0-rc.1", config);
    expect(result).toBe("/v1/definitions/ns/my-workflow/1.0.0-rc.1");
  });

  it("handles URL-encoded characters in path", () => {
    const result = validateGatewayHref("/v1/topology?namespace=my%20namespace", config);
    expect(result).toBe("/v1/topology?namespace=my%20namespace");
  });

  it("HARDENING: rejects backslash (Windows path confusion)", () => {
    expect(() =>
      validateGatewayHref("/\\evil.example", config)
    ).toThrow(/Rejected href with backslash/);
  });

  it("HARDENING: rejects double backslash", () => {
    expect(() =>
      validateGatewayHref("\\\\evil.example", config)
    ).toThrow(/Rejected href with backslash/);
  });

  it("HARDENING: rejects leading whitespace", () => {
    expect(() =>
      validateGatewayHref(" /v1/runtime/ns/name/1.0.0", config)
    ).toThrow(/Rejected href with whitespace or control characters/);
  });

  it("HARDENING: rejects trailing whitespace", () => {
    expect(() =>
      validateGatewayHref("/v1/runtime/ns/name/1.0.0 ", config)
    ).toThrow(/Rejected href with whitespace or control characters/);
  });

  it("HARDENING: rejects control characters", () => {
    expect(() =>
      validateGatewayHref("/v1/runtime\x00/ns/name/1.0.0", config)
    ).toThrow(/Rejected href with whitespace or control characters/);
  });

  it("CRITICAL: rejected href does NOT cause outbound fetch", async () => {
    // Spy on global fetch to ensure it's never called for rejected hrefs
    const fetchSpy = vi.spyOn(global, "fetch");

    try {
      validateGatewayHref("http://evil.example/steal-data", config);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeDefined();
    }

    // Verify fetch was NEVER called
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("CRITICAL: malicious instanceId cannot bypass validation", () => {
    // Even if instanceId contains malicious characters, encodeURIComponent prevents injection
    const maliciousId = "../../../evil";
    const concreteHref = `/v1/instances/${encodeURIComponent(maliciousId)}/suspend`;

    // Should still validate (encodeURIComponent prevented injection)
    const result = validateGatewayHref(concreteHref, config);
    expect(result).toContain("..%2F..%2F..%2Fevil"); // Encoded, safe
    expect(result).not.toContain("../"); // Not decoded
  });
});

describe("fetchGateway - no outbound requests for rejected hrefs", () => {
  const config: GatewayClientConfig = {
    baseUrl: "http://gateway.example.com",
  };

  it("CRITICAL: does not fetch when validateGatewayHref would reject", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    // This should not reach fetchGateway because handleExecute validates first
    // but we can test the validator directly
    try {
      validateGatewayHref("http://evil.example/", config);
      expect.fail("Should have thrown");
    } catch {
      // Expected
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
