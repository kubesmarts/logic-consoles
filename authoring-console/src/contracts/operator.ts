/**
 * Operator CRD facts, verified against `../logic-operator` @ commit
 * b9a71660267f0cad794b95e010569b280a932da8.
 *
 * Sources:
 * - api/v1/logicflowdefinition_types.go (labels, spec.flow, spec.runtimeRef, status)
 * - api/v1/logicflowruntime_types.go    (PersistenceMode enum, platformRef)
 * - api/v1/clusterlogicplatform_types.go (targetNamespace, cluster-scoped singleton)
 *
 * These are the authoritative strings; prose that disagrees is wrong.
 */
import type { KubeCondition } from "./kubernetes.ts";

export const LOGIC_GROUP = "logic.kubesmarts.org";
export const LOGIC_VERSION = "v1";
export const LOGIC_GROUP_VERSION = `${LOGIC_GROUP}/${LOGIC_VERSION}` as const;

export const LogicKinds = {
  ClusterLogicPlatform: "ClusterLogicPlatform",
  LogicFlowRuntime: "LogicFlowRuntime",
  LogicFlowDefinition: "LogicFlowDefinition",
  LogicFlowService: "LogicFlowService",
} as const;
export type LogicKind = (typeof LogicKinds)[keyof typeof LogicKinds];

/**
 * Labels the operator stamps on a LogicFlowDefinition for gateway/catalog
 * resolution. Verified in api/v1/logicflowdefinition_types.go and used by the
 * gateway reader (workflow-gateway/internal/catalog/build.go,
 * workflow-gateway/internal/definitions/reader.go). Version is part of identity.
 */
export const OperatorLabels = {
  workflowName: "logic.kubesmarts.org/workflow-name",
  workflowVersion: "logic.kubesmarts.org/workflow-version",
  workflowNamespace: "logic.kubesmarts.org/workflow-namespace",
  runtimeRef: "logic.kubesmarts.org/runtime-ref",
} as const;

/**
 * LogicFlowRuntime persistence strategy. Default is `Ephemeral`
 * (api/v1/logicflowruntime_webhook.go defaulting).
 */
export const PersistenceModes = {
  PlatformDB: "PlatformDB",
  Ephemeral: "Ephemeral",
} as const;
export type PersistenceMode = (typeof PersistenceModes)[keyof typeof PersistenceModes];

export const DEFAULT_PERSISTENCE_MODE: PersistenceMode = PersistenceModes.Ephemeral;

/**
 * ClusterLogicPlatform — cluster-scoped singleton. `spec.targetNamespace` is
 * immutable after creation (ADR 0001; crd-reference/clusterlogicplatform).
 */
export interface ClusterLogicPlatformSpec {
  /** Immutable after creation. Namespace that hosts platform-managed services. */
  readonly targetNamespace: string;
  readonly [extra: string]: unknown;
}

/**
 * LogicFlowRuntime — namespaced. `platformRef.name` is optional; all definition
 * versions of a family share one runtime in the namespace.
 */
export interface LogicFlowRuntimeSpec {
  readonly platformRef?: { readonly name: string };
  readonly persistenceMode?: PersistenceMode;
  readonly [extra: string]: unknown;
}

/**
 * LogicFlowDefinition — namespaced. Holds the portable workflow document in
 * `spec.flow` (OWS 1.0.0) and exactly one `spec.runtimeRef.name`.
 * `spec.runtimeRef.name` is immutable on update; the workflow `document.name` is
 * immutable across versions. Admission normalizes the document namespace to the
 * CR namespace.
 */
export interface LogicFlowDefinitionSpec {
  /** Immutable on update. Exactly one runtime for the whole family in the namespace. */
  readonly runtimeRef: { readonly name: string };
  /** The full OWS 1.0.0 workflow document (operator stores it as a raw object). */
  readonly flow: WorkflowDocument;
  readonly [extra: string]: unknown;
}

/**
 * The portable Open Workflow Specification document carried in `spec.flow`.
 * `document.name` is immutable across versions; `document.version` is part of
 * workflow identity. Kept deliberately open — only the identity fields are modeled.
 */
export interface WorkflowDocument {
  readonly document: {
    /** Immutable across versions. Part of WorkflowKey, NOT the CR name. */
    readonly name: string;
    /** Part of WorkflowVersionKey. */
    readonly version: string;
    /** Admission normalizes this to the CR namespace. */
    readonly namespace?: string;
    readonly [extra: string]: unknown;
  };
  readonly [extra: string]: unknown;
}

/** Status subresource fields the operator reports (api/v1/logicflowdefinition_types.go). */
export interface LogicFlowDefinitionStatus {
  readonly observedGeneration?: number;
  readonly workflowName?: string;
  readonly workflowVersion?: string;
  readonly workflowNamespace?: string;
  readonly conditions?: readonly KubeCondition[];
}
