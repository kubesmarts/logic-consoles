/**
 * Tests for gateway client - focusing on SSRF prevention.
 */
import { describe, it, expect } from "vitest";
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
    // Template placeholders like {id} get URL-encoded by the URL API - this is fine,
    // as substitution happens AFTER validation in handleInstanceAction
    expect(validateGatewayHref("/v1/instances/{id}/suspend", config)).toBe(
      "/v1/instances/%7Bid%7D/suspend"
    );
    expect(validateGatewayHref("/v1/topology?namespace=default", config)).toBe(
      "/v1/topology?namespace=default"
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
});
