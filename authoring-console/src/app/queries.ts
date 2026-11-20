/**
 * Read queries for the reference screens, keyed by session + relevant identity.
 *
 * The workflow list is built from the gateway catalog (grouped by effective namespace
 * + workflow document name) and enriched with each version's runtime and actual CR
 * name resolved from Kubernetes by the label convention. This is where the
 * workflow-identity vs CR-name separation is exercised end to end.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useConsole } from "./ConsoleContext.tsx";
import {
  LOGIC_GROUP,
  LOGIC_VERSION,
  LogicKinds,
  OperatorLabels,
  type DefinitionResource,
  type GroupVersionKind,
  type KubeObject,
  type LogicFlowDefinitionSpec,
  type LogicFlowDefinitionStatus,
  type ResourceRef,
  type WorkflowDocument,
  type WorkflowKey,
  type WorkflowVersionKey,
} from "../contracts/index.ts";
import { workflowKeyToString, workflowVersionKeyToString } from "../contracts/index.ts";

export const DEFINITION_GVK: GroupVersionKind = {
  group: LOGIC_GROUP,
  version: LOGIC_VERSION,
  kind: LogicKinds.LogicFlowDefinition,
};

type DefinitionObject = KubeObject<LogicFlowDefinitionSpec, LogicFlowDefinitionStatus>;

export interface WorkflowVersionRow {
  readonly version: WorkflowVersionKey;
  /** Actual CR name (may differ from workflowName). */
  readonly crName: string;
  readonly resource: ResourceRef;
  readonly runtimeName: string;
}

export interface WorkflowFamily {
  readonly key: WorkflowKey;
  /** All versions of the family share one runtime in the namespace. */
  readonly runtimeName: string | null;
  readonly versions: readonly WorkflowVersionRow[];
}

const resourceRefFor = (cr: DefinitionObject): ResourceRef => ({
  gvk: DEFINITION_GVK,
  name: cr.metadata.name,
  ...(cr.metadata.namespace !== undefined ? { namespace: cr.metadata.namespace } : {}),
});

const crLabelKey = (cr: DefinitionObject): string => {
  const labels = cr.metadata.labels ?? {};
  return `${cr.metadata.namespace ?? ""}/${labels[OperatorLabels.workflowName] ?? ""}@${labels[OperatorLabels.workflowVersion] ?? ""}`;
};

export const buildFamilies = (
  catalog: readonly DefinitionResource[],
  definitions: readonly DefinitionObject[],
  namespace: string,
): readonly WorkflowFamily[] => {
  const crByKey = new Map<string, DefinitionObject>();
  for (const cr of definitions) {
    crByKey.set(crLabelKey(cr), cr);
  }

  const families = new Map<string, WorkflowFamily & { versions: WorkflowVersionRow[] }>();
  for (const entry of catalog.filter((d) => d.namespace === namespace)) {
    const versionKey: WorkflowVersionKey = {
      namespace: entry.namespace,
      workflowName: entry.name,
      version: entry.version,
    };
    const cr = crByKey.get(workflowVersionKeyToString(versionKey));
    const familyKeyString = workflowKeyToString(versionKey);
    const row: WorkflowVersionRow = {
      version: versionKey,
      crName: cr?.metadata.name ?? entry.name,
      resource: cr ? resourceRefFor(cr) : { gvk: DEFINITION_GVK, name: entry.name, namespace: entry.namespace },
      runtimeName: cr?.spec?.runtimeRef.name ?? "",
    };
    const existing = families.get(familyKeyString);
    if (existing) {
      existing.versions.push(row);
    } else {
      families.set(familyKeyString, {
        key: { namespace: versionKey.namespace, workflowName: versionKey.workflowName },
        runtimeName: row.runtimeName || null,
        versions: [row],
      });
    }
  }

  return [...families.values()].map((family) => ({
    ...family,
    versions: [...family.versions].sort((a, b) => a.version.version.localeCompare(b.version.version)),
  }));
};

export const useWorkflowFamilies = (): UseQueryResult<readonly WorkflowFamily[]> => {
  const { session, gateway, kubernetes } = useConsole();
  const namespace = session.namespace ?? "default";
  return useQuery({
    queryKey: [session.sessionId, session.context.contextName, "families", namespace],
    queryFn: async ({ signal }) => {
      const [catalog, list] = await Promise.all([
        gateway.listDefinitions(signal),
        kubernetes.list<LogicFlowDefinitionSpec, LogicFlowDefinitionStatus>(DEFINITION_GVK, { namespace }, signal),
      ]);
      return buildFamilies(catalog, list.items, namespace);
    },
  });
};

export const useWorkflowFlow = (version: WorkflowVersionKey): UseQueryResult<WorkflowDocument> => {
  const { session, gateway } = useConsole();
  return useQuery({
    queryKey: [session.sessionId, session.context.contextName, "flow", workflowVersionKeyToString(version)],
    queryFn: ({ signal }) => gateway.getDefinition(version, signal),
  });
};

export const useWorkflowCr = (resource: ResourceRef): UseQueryResult<DefinitionObject> => {
  const { session, kubernetes } = useConsole();
  return useQuery({
    queryKey: [session.sessionId, session.context.contextName, "cr", resource.namespace ?? "", resource.name],
    queryFn: ({ signal }) => kubernetes.get<LogicFlowDefinitionSpec, LogicFlowDefinitionStatus>(resource, signal),
  });
};
