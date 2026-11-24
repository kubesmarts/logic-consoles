/**
 * Session and context identity.
 *
 * The same React application runs in two connection modes (ADR 0001, "Connection
 * and identity"): a local Node.js launcher that uses the selected kubeconfig
 * context, and a direct-browser mode for prepared clusters that holds a
 * short-lived token in memory. Contracts must not assume either mode — the actual
 * transport is injected (see KubernetesTransport / GatewayTransport). This module
 * only models the identity by which requests are keyed.
 *
 * Requests are keyed by session + context so that a disconnect or a cluster/context
 * change invalidates pending writes, cached results and write confirmations.
 */

export type ConnectionMode = "launcher" | "direct-browser";

export interface KubeContextIdentity {
  /**
   * The active kubeconfig context name (launcher mode) or a synthetic identifier
   * for the configured endpoint (direct-browser mode). Shown in the masthead.
   */
  readonly contextName: string;
  /** Human-facing cluster label (for example the API server host or context cluster). */
  readonly clusterDisplay: string;
}

export interface SessionIdentity {
  /**
   * Opaque launch-session identifier. A new launcher start or a new direct-browser
   * connection mints a fresh value. Credentials are NEVER part of this type; they
   * stay in the launcher process or in direct-browser session memory.
   */
  readonly sessionId: string;
  readonly mode: ConnectionMode;
  readonly context: KubeContextIdentity;
  /**
   * Active namespace for namespaced content. `null` before a namespace is selected
   * or on cluster-scoped views (Platform, Compatibility).
   */
  readonly namespace: string | null;
}

/**
 * The key every request is scoped by. A late response whose key no longer matches
 * the live session must be discarded (AGENTS.md: "Handle a late response after
 * cluster or namespace changes").
 */
export interface SessionScopedKey {
  readonly sessionId: string;
  readonly contextName: string;
}

export const sessionScopeOf = (session: SessionIdentity): SessionScopedKey => ({
  sessionId: session.sessionId,
  contextName: session.context.contextName,
});

export const sessionScopeMatches = (a: SessionScopedKey, b: SessionScopedKey): boolean =>
  a.sessionId === b.sessionId && a.contextName === b.contextName;
