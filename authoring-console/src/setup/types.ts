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
  readonly targetNamespace: string;
  readonly executionMode: ExecutionMode;
  readonly dataIndex?: DataIndexConfig;
  readonly vector?: VectorConfig;
  readonly gatewayIngress: GatewayIngressConfig;
}
