/**
 * Build ClusterLogicPlatform CR from draft.
 * Verifies against operator types at b9a71660267f0cad794b95e010569b280a932da8.
 */
import type { KubeObject } from "../contracts/index.ts";
import { LOGIC_GROUP, LOGIC_VERSION, LogicKinds } from "../contracts/index.ts";
import type { PlatformSetupDraft } from "./types.ts";

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
  readonly runtime?: unknown;
  readonly [extra: string]: unknown;
}

export interface ClusterLogicPlatformCRStatus {
  readonly phase?: "Pending" | "Ready" | "Failed";
  readonly observedGeneration?: number;
  readonly dataIndex?: unknown;
  readonly vector?: unknown;
  readonly gateway?: unknown;
  readonly conditions?: unknown[];
  readonly [extra: string]: unknown;
}

export function buildPlatformCR(draft: PlatformSetupDraft): KubeObject<ClusterLogicPlatformCRSpec, ClusterLogicPlatformCRStatus> {
  const spec: ClusterLogicPlatformCRSpec = {
    targetNamespace: draft.targetNamespace,
    ...(draft.executionMode === "history-enabled" && draft.dataIndex
      ? {
          dataIndex: {
            persistence: {
              postgresql: {
                secretRef: {
                  name: draft.dataIndex.postgresqlSecretName,
                },
                serviceRef: {
                  name: draft.dataIndex.postgresqlServiceName,
                  ...(draft.dataIndex.postgresqlServiceNamespace && {
                    namespace: draft.dataIndex.postgresqlServiceNamespace,
                  }),
                  ...(draft.dataIndex.databaseName && {
                    databaseName: draft.dataIndex.databaseName,
                  }),
                  ...(draft.dataIndex.databaseSchema && {
                    databaseSchema: draft.dataIndex.databaseSchema,
                  }),
                },
              },
            },
          },
        }
      : {}),
    ...(draft.executionMode === "history-enabled" && draft.vector
      ? {
          vector: {
            ...(draft.vector.watchNamespaces && {
              watchNamespaces: draft.vector.watchNamespaces,
            }),
            ...(draft.vector.debugEvents !== undefined && {
              debugEvents: draft.vector.debugEvents,
            }),
            application: {},
          },
        }
      : {}),
    ...(draft.gatewayIngress.enabled
      ? {
          gateway: {
            ingress: {
              enabled: true,
              ...(draft.gatewayIngress.host && {
                host: draft.gatewayIngress.host,
              }),
              ...(draft.gatewayIngress.ingressClassName && {
                ingressClassName: draft.gatewayIngress.ingressClassName,
              }),
            },
          },
        }
      : {}),
  };

  return {
    apiVersion: `${LOGIC_GROUP}/${LOGIC_VERSION}`,
    kind: LogicKinds.ClusterLogicPlatform,
    metadata: {
      name: "cluster-platform",
      namespace: "",
    },
    spec,
  };
}
