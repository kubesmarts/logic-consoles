/**
 * Runtime setup wizard types — Packet D2.
 */

export type RuntimeCreationMode = "select-existing" | "create-new";

export type RuntimePersistenceMode = "Ephemeral" | "PlatformDB";

export interface RuntimeSetupDraft {
  /** Select existing runtime OR create new */
  readonly mode: RuntimeCreationMode;
  /** Selected existing runtime name (when mode=select-existing) */
  readonly selectedRuntimeName?: string;
  /** Runtime name (when mode=create-new) */
  readonly name: string;
  /** Namespace for the runtime */
  readonly namespace: string;
  /** Platform reference */
  readonly platformRef?: string;
  /** Persistence mode (Ephemeral | PlatformDB) */
  readonly persistenceMode: RuntimePersistenceMode;
  /** Number of replicas */
  readonly replicas?: number;
  /** Structured logging config */
  readonly structuredLogging?: {
    readonly enabled: boolean;
    readonly includeWorkflowPayloads?: boolean;
    readonly includeTaskPayloads?: boolean;
  };
  /** Runner security config */
  readonly security?: {
    readonly type: "NONE" | "API_KEY" | "OIDC";
    readonly apiKey?: {
      readonly keys: Array<{
        readonly name: string;
        readonly secretName: string;
        readonly secretKey: string;
        readonly roles: Array<"flow-admin" | "flow-invoker">;
      }>;
    };
    readonly oidc?: {
      readonly authServerUrl: string;
      readonly clientId: string;
      readonly clientSecretName: string;
      readonly clientSecretKey: string;
      readonly rolesClaim?: string;
    };
  };
}

export interface RuntimeDiscoveryState {
  readonly platformExists: boolean;
  readonly vectorWatchNamespaces?: readonly string[];
}
