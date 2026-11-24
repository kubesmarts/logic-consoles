/**
 * Setup wizard types for platform configuration.
 * Packet D1: ClusterLogicPlatform setup wizard.
 */

/**
 * Platform discovery state.
 */
export interface PlatformDiscoveryState {
  readonly kind: "absent" | "present" | "read-only" | "forbidden";
  readonly platform?: unknown; // KubeObject<ClusterLogicPlatformSpec>
  readonly error?: string;
}

/**
 * Execution mode choice.
 */
export type ExecutionMode = "quick-run" | "history-enabled";

/**
 * Data Index configuration (history path only).
 */
export interface DataIndexConfig {
  readonly postgresqlSecretName: string;
  readonly postgresqlServiceName: string;
  readonly postgresqlServiceNamespace?: string;
  readonly databaseName?: string;
  readonly databaseSchema?: string;
}

/**
 * Vector configuration.
 */
export interface VectorConfig {
  readonly watchNamespaces?: readonly string[];
  readonly debugEvents?: boolean;
}

/**
 * Gateway ingress configuration.
 */
export interface GatewayIngressConfig {
  readonly enabled: boolean;
  readonly host?: string;
  readonly ingressClassName?: string;
}

/**
 * Platform setup draft maintained across wizard steps.
 */
export interface PlatformSetupDraft {
  readonly runtimePersistence?: RuntimePersistence | null;
  readonly targetNamespace: string;
  readonly executionMode: ExecutionMode;
  readonly dataIndex?: DataIndexConfig;
  readonly vector?: VectorConfig;
  readonly gatewayIngress: GatewayIngressConfig;
}

export interface RuntimeDatastore {
  postgresql?: {
    secretRef: { name: string };
    serviceRef: { name: string; namespace?: string; databaseName?: string; databaseSchema?: string };
  };
  migrationSecretRef?: { name: string };
}

export interface RuntimePersistence {
  runtime?: RuntimeDatastore;
  quartz?: RuntimeDatastore;
}

/** Resolve the Vector settings displayed by the history-enabled platform wizard. */
export function platformVectorConfig(draft: PlatformSetupDraft): VectorConfig {
  const watchNamespaces = draft.vector?.watchNamespaces;
  return {
    watchNamespaces: watchNamespaces?.[0]?.trim() ? watchNamespaces : [draft.targetNamespace],
    debugEvents: draft.vector?.debugEvents ?? false,
  };
}
