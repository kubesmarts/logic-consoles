/**
 * Publish utilities for building LogicFlowDefinition candidates.
 *
 * The actual ResourceEditor hook is used by the publish component directly
 * (since hooks can't be called conditionally). This module provides helper
 * functions to build the candidate objects.
 */

import { useQuery } from "@tanstack/react-query";
import type {
  KubeObject,
  LogicFlowDefinitionSpec,
  LogicFlowDefinitionStatus,
  GroupVersionKind,
  ListOptions,
  WorkflowDocument,
  WorkflowVersionKey,
  KubernetesTransport,
} from "../../contracts/index.ts";
import {
  LOGIC_GROUP,
  LOGIC_VERSION,
  LogicKinds,
  OperatorLabels,
} from "../../contracts/index.ts";
import { generateCrName } from "./cr-name-generator.ts";
import { resolveWorkflowVersion } from "./family-resolution.ts";

export const RUNTIME_GVK: GroupVersionKind = {
  group: LOGIC_GROUP,
  version: LOGIC_VERSION,
  kind: LogicKinds.LogicFlowRuntime,
};

export const DEFINITION_GVK: GroupVersionKind = {
  group: LOGIC_GROUP,
  version: LOGIC_VERSION,
  kind: LogicKinds.LogicFlowDefinition,
};

export type PublishMode = "create" | "update";

export interface RuntimeInfo {
  readonly name: string;
  readonly namespace: string;
  readonly persistenceMode: string;
}

export interface PublishCandidate {
  readonly crName: string;
  readonly candidate: KubeObject<LogicFlowDefinitionSpec, LogicFlowDefinitionStatus>;
  readonly deployed?: KubeObject<LogicFlowDefinitionSpec, LogicFlowDefinitionStatus>;
}

/**
 * Build a LogicFlowDefinition candidate for publishing.
 *
 * @param mode - "create" or "update"
 * @param workflowYaml - The portable workflow YAML
 * @param namespace - Target namespace
 * @param workflowName - Workflow name
 * @param version - Version string
 * @param runtimeName - Runtime to use
 * @param transport - Kubernetes transport (for fetching deployed object in update mode)
 * @returns The candidate object and CR name
 */
export const buildPublishCandidate = async (
  mode: PublishMode,
  workflowYaml: string,
  namespace: string,
  workflowName: string,
  version: string,
  runtimeName: string,
  transport: KubernetesTransport,
): Promise<PublishCandidate> => {
  // Parse the workflow document
  let flow: WorkflowDocument;
  try {
    const { parse } = await import("yaml");
    const parsed = parse(workflowYaml) as WorkflowDocument;
    if (!parsed?.document || parsed.document.name !== workflowName) {
      throw new Error("Workflow name differs from the selected definition");
    }
    flow = { ...parsed, document: { ...parsed.document, namespace, version } };
  } catch (error) {
    throw new Error(`Failed to parse workflow YAML: ${String(error)}`);
  }

  let crName: string;
  let deployed: KubeObject<LogicFlowDefinitionSpec, LogicFlowDefinitionStatus> | undefined;

  if (mode === "create") {
    // Generate CR name
    const nameResult = await generateCrName({ namespace, workflowName, version });
    if ("error" in nameResult) {
      throw new Error("CR name too long - please choose a shorter workflow name or version");
    }
    crName = nameResult.name;
  } else {
    // Update mode: resolve existing CR
    const versionKey: WorkflowVersionKey = { namespace, workflowName, version };
    const resolution = await resolveWorkflowVersion(transport, versionKey);
    if (resolution.kind !== "unambiguous") {
      throw new Error("Cannot update: version not found or ambiguous");
    }
    crName = resolution.resolution.resource.name;

    // Fetch deployed object for diff
    deployed = await transport.get(resolution.resolution.resource);
  }

  // Build the candidate
  const candidate: KubeObject<LogicFlowDefinitionSpec, LogicFlowDefinitionStatus> = {
    apiVersion: `${LOGIC_GROUP}/${LOGIC_VERSION}`,
    kind: LogicKinds.LogicFlowDefinition,
    metadata: {
      ...deployed?.metadata,
      name: crName,
      namespace,
      labels: {
        ...deployed?.metadata.labels,
        [OperatorLabels.workflowName]: workflowName,
        [OperatorLabels.workflowVersion]: version,
        [OperatorLabels.runtimeRef]: runtimeName,
      },
      ...(deployed?.metadata.resourceVersion
        ? { resourceVersion: deployed.metadata.resourceVersion }
        : {}),
    },
    spec: {
      ...deployed?.spec,
      runtimeRef: { name: runtimeName },
      flow,
    },
  };

  return { crName, candidate, deployed };
};

/**
 * Query hook to list runtimes in a namespace.
 */
export const useRuntimes = (
  transport: KubernetesTransport,
  sessionId: string,
  namespace: string,
) => {
  return useQuery({
    queryKey: [sessionId, "runtimes", namespace],
    queryFn: async ({ signal }) => {
      const list = await transport.list(
        RUNTIME_GVK,
        { namespace } as ListOptions,
        signal,
      );
      return list.items.map((item): RuntimeInfo => ({
        name: item.metadata.name,
        namespace: item.metadata.namespace ?? "",
        persistenceMode: (item.spec as { persistenceMode?: string })?.persistenceMode ?? "Ephemeral",
      }));
    },
    enabled: !!namespace,
  });
};
