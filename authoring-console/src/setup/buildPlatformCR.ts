/**
 * Build ClusterLogicPlatform CR from draft.
 * Verifies against operator types at b9a71660267f0cad794b95e010569b280a932da8.
 */
import type { KubeObject } from "../contracts/index.ts";
import { LOGIC_GROUP, LOGIC_VERSION, LogicKinds } from "../contracts/index.ts";
import { platformVectorConfig, type RuntimePersistence, type PlatformSetupDraft } from "./types.ts";

export interface ClusterLogicPlatformCRSpec {
  readonly targetNamespace: string;
  readonly dataIndex?: {
    readonly persistence?: {
      readonly postgresql?: {
        readonly secretRef: { readonly name: string };
        readonly serviceRef: {
          readonly name: string;
          readonly namespace?: string;
          readonly databaseName?: string;
          readonly databaseSchema?: string;
        };
      };
    };
  };
  readonly vector?: {
    readonly watchNamespaces?: readonly string[];
    readonly debugEvents?: boolean;
    readonly application?: {
      readonly image?: string;
      readonly replicas?: number;
      readonly resources?: Record<string, unknown>;
    };
  };
  readonly gateway?: {
    readonly ingress?: {
      readonly enabled: boolean;
      readonly host?: string;
      readonly ingressClassName?: string;
    };
  };
  readonly runtime?: { persistence?: RuntimePersistence; [field: string]: unknown };
  readonly [extra: string]: unknown;
}

export interface DataIndexStatus {
  readonly ready: boolean;
  readonly service?: unknown;
  readonly persistence?: unknown;
}

export interface VectorStatus {
  readonly ready: boolean;
  readonly daemonSetRef?: { readonly name: string };
  readonly metricsEndpoint?: string;
}

export interface WorkflowGatewayStatus {
  readonly ready: boolean;
  readonly deploymentRef?: { readonly name: string };
  readonly serviceRef?: { readonly name: string };
  readonly ingressRef?: { readonly name: string };
  readonly routeRef?: { readonly name: string };
  readonly url?: string;
}

export interface ClusterLogicPlatformCRStatus {
  readonly phase?: "Pending" | "Ready" | "Failed";
  readonly observedGeneration?: number;
  readonly dataIndex?: DataIndexStatus;
  readonly vector?: VectorStatus;
  readonly gateway?: WorkflowGatewayStatus;
  readonly conditions?: Array<{
    readonly type: string;
    readonly status: string;
    readonly reason?: string;
    readonly message?: string;
    readonly lastTransitionTime?: string;
  }>;
  readonly [extra: string]: unknown;
}

export function buildPlatformCR(draft: PlatformSetupDraft, existing?: KubeObject<ClusterLogicPlatformCRSpec, ClusterLogicPlatformCRStatus> | null): KubeObject<ClusterLogicPlatformCRSpec, ClusterLogicPlatformCRStatus> {
  const previous = existing?.spec;
  const pg = previous?.dataIndex?.persistence?.postgresql;
  const db = draft.dataIndex;
  const { host, ingressClassName, enabled } = draft.gatewayIngress;
  const spec: ClusterLogicPlatformCRSpec = {
    ...previous,
    ...(draft.runtimePersistence !== undefined && { runtime: { ...previous?.runtime, persistence: draft.runtimePersistence ?? undefined } }),
    targetNamespace: draft.targetNamespace,
    gateway: {
      ...previous?.gateway,
      ingress: enabled ? { ...previous?.gateway?.ingress, enabled, host, ingressClassName } : undefined,
    },
    dataIndex: draft.executionMode === "history-enabled" && db ? {
      ...previous?.dataIndex,
      persistence: {
        ...previous?.dataIndex?.persistence,
        postgresql: {
          ...pg,
          secretRef: { ...pg?.secretRef, name: db.postgresqlSecretName },
          serviceRef: {
            ...pg?.serviceRef,
            name: db.postgresqlServiceName,
            namespace: db.postgresqlServiceNamespace || undefined,
            databaseName: db.databaseName || undefined,
            databaseSchema: db.databaseSchema || undefined,
          },
        },
      },
    } : draft.executionMode === "history-enabled" ? previous?.dataIndex : undefined,
    vector: draft.executionMode === "history-enabled"
      ? { ...previous?.vector, ...platformVectorConfig(draft) }
      : undefined,
  };

  return {
    apiVersion: `${LOGIC_GROUP}/${LOGIC_VERSION}`,
    kind: LogicKinds.ClusterLogicPlatform,
    metadata: existing?.metadata ?? { name: "cluster-platform" },
    spec,
  };
}
