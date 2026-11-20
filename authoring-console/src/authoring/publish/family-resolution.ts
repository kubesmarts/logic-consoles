/**
 * Family resolution — resolving WorkflowVersionKey to actual Kubernetes CRs.
 *
 * Uses the label-based lookup convention (ADR 0001 / PLAN §5):
 * List LogicFlowDefinitions in the namespace filtered by workflow-name and
 * workflow-version labels, then fetch by metadata.name. This handles both
 * console-generated and hand-authored CR names (e.g. `hello-world-v1-0-0`).
 *
 * Surfaces AMBIGUITY when multiple CRs claim the same (workflow, version).
 */

import type {
  KubernetesTransport,
  WorkflowVersionKey,
  WorkflowVersionResolution,
  GroupVersionKind,
  ResourceRef,
  LogicFlowDefinitionSpec,
  LogicFlowDefinitionStatus,
} from "../../contracts/index.ts";
import { LOGIC_GROUP, LOGIC_VERSION, LogicKinds, OperatorLabels } from "../../contracts/index.ts";

export const DEFINITION_GVK: GroupVersionKind = {
  group: LOGIC_GROUP,
  version: LOGIC_VERSION,
  kind: LogicKinds.LogicFlowDefinition,
};

export interface AmbiguousResolution {
  readonly kind: "ambiguous";
  /** The multiple CRs claiming the same workflow version. */
  readonly candidates: readonly ResourceRef[];
}

export interface UnambiguousResolution {
  readonly kind: "unambiguous";
  readonly resolution: WorkflowVersionResolution;
}

export interface NotFoundResolution {
  readonly kind: "not-found";
}

export type ResolutionResult = UnambiguousResolution | AmbiguousResolution | NotFoundResolution;

/**
 * Resolve a WorkflowVersionKey to its actual Kubernetes CR(s).
 *
 * Returns:
 * - `unambiguous` when exactly one CR matches
 * - `ambiguous` when multiple CRs claim the same version (blocks update/run)
 * - `not-found` when no CR matches
 */
export const resolveWorkflowVersion = async (
  transport: KubernetesTransport,
  version: WorkflowVersionKey,
  signal?: AbortSignal,
): Promise<ResolutionResult> => {
  const { namespace, workflowName, version: versionString } = version;

  // Build label selector for workflow-name + workflow-version
  const labelSelector = [
    `${OperatorLabels.workflowName}=${workflowName}`,
    `${OperatorLabels.workflowVersion}=${versionString}`,
  ].join(",");

  // List CRs in namespace with label filter
  const list = await transport.list<LogicFlowDefinitionSpec, LogicFlowDefinitionStatus>(
    DEFINITION_GVK,
    { namespace, labelSelector },
    signal,
  );

  if (list.items.length === 0) {
    return { kind: "not-found" };
  }

  if (list.items.length === 1) {
    const cr = list.items[0]!;
    const resource: ResourceRef = {
      gvk: DEFINITION_GVK,
      name: cr.metadata.name,
      namespace: cr.metadata.namespace,
    };
    return {
      kind: "unambiguous",
      resolution: { version, resource },
    };
  }

  // Multiple CRs claim the same version → ambiguity
  const candidates: ResourceRef[] = list.items.map((cr) => ({
    gvk: DEFINITION_GVK,
    name: cr.metadata.name,
    namespace: cr.metadata.namespace,
  }));

  return { kind: "ambiguous", candidates };
};
