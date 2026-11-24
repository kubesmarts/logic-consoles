/**
 * Runtime CR builder — Packet D2.
 * Builds a LogicFlowRuntime CR from the wizard draft against REAL operator fields.
 *
 * Sources (@ b9a71660267f0cad794b95e010569b280a932da8):
 * - api/v1/logicflowruntime_types.go (spec shape, PersistenceMode, security, logging)
 * - api/v1/podtemplate_types.go (ApplicationSpec, PodTemplateSpec, ContainerSpec)
 * - api/v1/deployment_types.go (ApplicationSpec)
 * - config/samples/logic_v1_logicflowruntime.yaml
 */
import { LOGIC_GROUP_VERSION, LogicKinds, type KubeObject } from "../../contracts/index.ts";
import type { RuntimeSetupDraft } from "./types.ts";

/**
 * LogicFlowRuntimeSpec — full structure including embedded ApplicationSpec.
 * Only platformRef and persistenceMode are typed in contracts/operator.ts;
 * replicas, security, logging, podTemplate come from operator sources.
 */
export interface LogicFlowRuntimeCRSpec {
  platformRef?: { name: string };
  persistenceMode?: "Ephemeral" | "PlatformDB";
  replicas?: number;
  security?: {
    type?: "NONE" | "API_KEY" | "OIDC";
    apiKey?: {
      keys: Array<{
        name: string;
        secretRef: {
          name: string;
          key?: string;
        };
        roles: Array<"flow-admin" | "flow-invoker">;
      }>;
    };
    oidc?: {
      authServerUrl: string;
      clientId: string;
      clientSecret: {
        name: string;
        key?: string;
      };
      rolesClaim?: string;
    };
  };
  logging?: {
    enabled?: boolean;
    includeWorkflowPayloads?: boolean;
    includeTaskPayloads?: boolean;
  };
  // Advanced pod template fields preserved via ResourceEditor
  podTemplate?: {
    metadata?: {
      labels?: Record<string, string>;
      annotations?: Record<string, string>;
    };
    container?: Record<string, unknown>;
    replicas?: number;
    [key: string]: unknown;
  };
  [extra: string]: unknown;
}

export interface LogicFlowRuntimeCRStatus {
  readonly observedGeneration?: number;
  readonly phase?: string;
  readonly replicas?: number;
  readonly readyReplicas?: number;
  readonly selector?: string;
  readonly definitions?: ReadonlyArray<{
    readonly name: string;
    readonly version?: string;
  }>;
  readonly conditions?: ReadonlyArray<{
    readonly type: string;
    readonly status: string;
    readonly reason?: string;
    readonly message?: string;
    readonly lastTransitionTime?: string;
  }>;
}

/**
 * Build a LogicFlowRuntime CR from the wizard draft.
 * Constructs the spec against operator field names from logicflowruntime_types.go.
 */
export function buildRuntimeCR(
  draft: RuntimeSetupDraft,
): KubeObject<LogicFlowRuntimeCRSpec, LogicFlowRuntimeCRStatus> {
  // Build spec with mutable fields
  const spec: Partial<LogicFlowRuntimeCRSpec> = {
    ...(draft.platformRef ? { platformRef: { name: draft.platformRef } } : {}),
    persistenceMode: draft.persistenceMode,
    ...(draft.replicas !== undefined && draft.replicas > 0 ? { replicas: draft.replicas } : {}),
  };

  // Security configuration (RuntimeSecuritySpec from logicflowruntime_types.go:189)
  if (draft.security) {
    spec.security = {
      type: draft.security.type,
    };

    if (draft.security.type === "API_KEY" && draft.security.apiKey) {
      spec.security.apiKey = {
        keys: draft.security.apiKey.keys.map((k) => ({
          name: k.name,
          secretRef: {
            name: k.secretName,
            key: k.secretKey || "value",
          },
          roles: k.roles,
        })),
      };
    }

    if (draft.security.type === "OIDC" && draft.security.oidc) {
      spec.security.oidc = {
        authServerUrl: draft.security.oidc.authServerUrl,
        clientId: draft.security.oidc.clientId,
        clientSecret: {
          name: draft.security.oidc.clientSecretName,
          key: draft.security.oidc.clientSecretKey || "value",
        },
        ...(draft.security.oidc.rolesClaim ? { rolesClaim: draft.security.oidc.rolesClaim } : {}),
      };
    }
  }

  // Structured logging (StructuredLoggingSpec from logicflowruntime_types.go:264)
  if (draft.structuredLogging) {
    spec.logging = {
      enabled: draft.structuredLogging.enabled,
      includeWorkflowPayloads: draft.structuredLogging.includeWorkflowPayloads,
      includeTaskPayloads: draft.structuredLogging.includeTaskPayloads,
    };
  }

  return {
    apiVersion: LOGIC_GROUP_VERSION,
    kind: LogicKinds.LogicFlowRuntime,
    metadata: {
      name: draft.name,
      namespace: draft.namespace,
    },
    spec: spec as LogicFlowRuntimeCRSpec,
  };
}
