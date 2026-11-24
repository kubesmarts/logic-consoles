/**
 * Launcher-internal types (Node.js only).
 *
 * Session scoping, context identity and security validation for the loopback API.
 * Keep this separate from browser-side code — it imports node-only modules.
 */

/** The launcher's local session identity, minted on startup. */
export interface LauncherSession {
  readonly sessionId: string;
  readonly startedAt: Date;
}

/** Active kubeconfig context selected by the user. */
export interface ActiveContext {
  readonly contextName: string;
  readonly clusterDisplay: string;
  /** Set when user changes context — invalidates pending writes. */
  readonly selectedAt: Date;
}

/** Session + context scoping key for validating requests. */
export interface SessionContextKey {
  readonly sessionId: string;
  readonly contextName: string;
}

/** Request metadata validated by security middleware. */
export interface ValidatedRequest {
  readonly sessionKey: SessionContextKey;
  readonly namespace: string | null;
}

/** Gateway configuration discovered or entered by user. */
export interface GatewayConfig {
  readonly baseUrl: string;
  readonly discoveredAt: Date;
}

/** Launcher runtime state. */
export interface LauncherState {
  session: LauncherSession;
  context: ActiveContext | null;
  gateway: GatewayConfig | null;
}
