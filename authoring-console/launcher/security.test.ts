/**
 * Tests for security validation.
 */
import { describe, it, expect } from "vitest";
import type { IncomingMessage } from "node:http";
import {
  validateHost,
  validateOrigin,
  validateLoopbackRequest,
  extractSessionContext,
  validateSessionContext,
  formatOrigin,
  type LoopbackOrigin,
} from "./security.js";

const mockRequest = (headers: Record<string, string>): IncomingMessage => {
  return { headers } as IncomingMessage;
};

describe("formatOrigin", () => {
  it("formats loopback origin correctly", () => {
    const origin: LoopbackOrigin = { scheme: "http", host: "127.0.0.1", port: 8080 };
    expect(formatOrigin(origin)).toBe("http://127.0.0.1:8080");
  });

  it("formats localhost origin correctly", () => {
    const origin: LoopbackOrigin = { scheme: "http", host: "localhost", port: 3000 };
    expect(formatOrigin(origin)).toBe("http://localhost:3000");
  });
});

describe("validateHost", () => {
  const origin: LoopbackOrigin = { scheme: "http", host: "127.0.0.1", port: 8080 };

  it("accepts matching host header", () => {
    const req = mockRequest({ host: "127.0.0.1:8080" });
    expect(validateHost(req, origin)).toBe(true);
  });

  it("accepts localhost when origin is 127.0.0.1", () => {
    const req = mockRequest({ host: "localhost:8080" });
    expect(validateHost(req, origin)).toBe(true);
  });

  it("rejects mismatched port", () => {
    const req = mockRequest({ host: "127.0.0.1:9000" });
    expect(validateHost(req, origin)).toBe(false);
  });

  it("rejects external host", () => {
    const req = mockRequest({ host: "example.com:8080" });
    expect(validateHost(req, origin)).toBe(false);
  });

  it("rejects missing host header", () => {
    const req = mockRequest({});
    expect(validateHost(req, origin)).toBe(false);
  });
});

describe("validateOrigin", () => {
  const origin: LoopbackOrigin = { scheme: "http", host: "127.0.0.1", port: 8080 };

  it("accepts missing origin header (same-origin request)", () => {
    const req = mockRequest({});
    expect(validateOrigin(req, origin)).toBe(true);
  });

  it("accepts matching origin header", () => {
    const req = mockRequest({ origin: "http://127.0.0.1:8080" });
    expect(validateOrigin(req, origin)).toBe(true);
  });

  it("accepts localhost when origin is 127.0.0.1", () => {
    const req = mockRequest({ origin: "http://localhost:8080" });
    expect(validateOrigin(req, origin)).toBe(true);
  });

  it("rejects mismatched port", () => {
    const req = mockRequest({ origin: "http://127.0.0.1:9000" });
    expect(validateOrigin(req, origin)).toBe(false);
  });

  it("rejects external origin", () => {
    const req = mockRequest({ origin: "http://example.com:8080" });
    expect(validateOrigin(req, origin)).toBe(false);
  });

  it("rejects https when origin is http", () => {
    const req = mockRequest({ origin: "https://127.0.0.1:8080" });
    expect(validateOrigin(req, origin)).toBe(false);
  });
});

describe("validateLoopbackRequest", () => {
  const origin: LoopbackOrigin = { scheme: "http", host: "127.0.0.1", port: 8080 };

  it("accepts valid loopback request", () => {
    const req = mockRequest({ host: "127.0.0.1:8080", origin: "http://127.0.0.1:8080" });
    expect(validateLoopbackRequest(req, origin)).toBe(true);
  });

  it("accepts request without origin header", () => {
    const req = mockRequest({ host: "127.0.0.1:8080" });
    expect(validateLoopbackRequest(req, origin)).toBe(true);
  });

  it("rejects when host is invalid", () => {
    const req = mockRequest({ host: "example.com:8080", origin: "http://127.0.0.1:8080" });
    expect(validateLoopbackRequest(req, origin)).toBe(false);
  });

  it("rejects when origin is invalid", () => {
    const req = mockRequest({ host: "127.0.0.1:8080", origin: "http://example.com:8080" });
    expect(validateLoopbackRequest(req, origin)).toBe(false);
  });
});

describe("extractSessionContext", () => {
  it("extracts session and context headers", () => {
    const req = mockRequest({
      "x-session-id": "abc123",
      "x-context-name": "my-context",
    });
    const result = extractSessionContext(req);
    expect(result).toEqual({
      sessionId: "abc123",
      contextName: "my-context",
    });
  });

  it("returns null when session-id is missing", () => {
    const req = mockRequest({ "x-context-name": "my-context" });
    expect(extractSessionContext(req)).toBeNull();
  });

  it("returns null when context-name is missing", () => {
    const req = mockRequest({ "x-session-id": "abc123" });
    expect(extractSessionContext(req)).toBeNull();
  });

  it("returns null when both headers are missing", () => {
    const req = mockRequest({});
    expect(extractSessionContext(req)).toBeNull();
  });
});

describe("validateSessionContext", () => {
  it("returns true when session and context match", () => {
    const provided = { sessionId: "abc123", contextName: "my-context" };
    const active = { sessionId: "abc123", contextName: "my-context" };
    expect(validateSessionContext(provided, active)).toBe(true);
  });

  it("returns false when session differs", () => {
    const provided = { sessionId: "abc123", contextName: "my-context" };
    const active = { sessionId: "xyz789", contextName: "my-context" };
    expect(validateSessionContext(provided, active)).toBe(false);
  });

  it("returns false when context differs", () => {
    const provided = { sessionId: "abc123", contextName: "my-context" };
    const active = { sessionId: "abc123", contextName: "other-context" };
    expect(validateSessionContext(provided, active)).toBe(false);
  });

  it("returns false when both differ", () => {
    const provided = { sessionId: "abc123", contextName: "my-context" };
    const active = { sessionId: "xyz789", contextName: "other-context" };
    expect(validateSessionContext(provided, active)).toBe(false);
  });
});
