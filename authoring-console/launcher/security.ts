/**
 * Security validation for the loopback API.
 *
 * CRITICAL CONSTRAINTS (task-B-brief.md):
 * - Bind loopback only (127.0.0.1)
 * - Validate Host AND Origin on every request
 * - Tie requests to launch session id + selected context
 * - A context change invalidates pending writes
 * - Keep kubeconfig credentials IN launcher process
 */
import type { IncomingMessage } from "node:http";
import type { SessionContextKey } from "./types.js";

/** The expected loopback origin (scheme + host + port). */
export interface LoopbackOrigin {
  readonly scheme: "http";
  readonly host: "127.0.0.1" | "localhost";
  readonly port: number;
}

/** Construct the full origin string. */
export const formatOrigin = (origin: LoopbackOrigin): string =>
  `${origin.scheme}://${origin.host}:${origin.port}`;

/** Extract Host header value. */
const getHost = (req: IncomingMessage): string | null => {
  const host = req.headers.host;
  return typeof host === "string" ? host : null;
};

/** Extract Origin header value. */
const getOrigin = (req: IncomingMessage): string | null => {
  const origin = req.headers.origin;
  return typeof origin === "string" ? origin : null;
};

/** Validate that Host header matches the expected loopback address. */
export const validateHost = (req: IncomingMessage, expected: LoopbackOrigin): boolean => {
  const host = getHost(req);
  if (!host) {
    return false;
  }

  const expectedHost = `${expected.host}:${expected.port}`;
  const alternateHost = expected.host === "127.0.0.1" ? `localhost:${expected.port}` : `127.0.0.1:${expected.port}`;

  return host === expectedHost || host === alternateHost;
};

/**
 * Validate that Origin header matches the expected loopback origin.
 * Origin is only present on CORS requests (fetch from browser); same-origin
 * requests and direct navigation may omit it. When present, it MUST match.
 */
export const validateOrigin = (req: IncomingMessage, expected: LoopbackOrigin): boolean => {
  const origin = getOrigin(req);

  // No Origin header: allow (same-origin request or direct navigation).
  if (!origin) {
    return true;
  }

  const expectedOrigin = formatOrigin(expected);
  const alternateOrigin = expected.host === "127.0.0.1"
    ? `${expected.scheme}://localhost:${expected.port}`
    : `${expected.scheme}://127.0.0.1:${expected.port}`;

  return origin === expectedOrigin || origin === alternateOrigin;
};

/**
 * Validate both Host and Origin headers.
 * Returns true if request is from the expected loopback origin.
 */
export const validateLoopbackRequest = (req: IncomingMessage, expected: LoopbackOrigin): boolean => {
  return validateHost(req, expected) && validateOrigin(req, expected);
};

/**
 * Extract session and context from request headers.
 * Browser sends these as custom headers on every API request.
 */
export const extractSessionContext = (req: IncomingMessage): SessionContextKey | null => {
  const sessionId = req.headers["x-session-id"];
  const contextName = req.headers["x-context-name"];

  if (typeof sessionId !== "string" || typeof contextName !== "string") {
    return null;
  }

  return { sessionId, contextName };
};

/**
 * Validate that request's session+context key matches the active launcher state.
 * A context change invalidates pending writes.
 */
export const validateSessionContext = (
  provided: SessionContextKey,
  active: SessionContextKey
): boolean => {
  return provided.sessionId === active.sessionId && provided.contextName === active.contextName;
};
