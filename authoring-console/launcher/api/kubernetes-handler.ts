/**
 * Kubernetes API request handlers for the launcher.
 *
 * Implements GET/LIST/DRYRUN/CREATE/UPDATE operations using the selected kubeconfig context.
 * Maps @kubernetes/client-node responses to the contracts/kubernetes.ts types.
 */
import type { K8sClientContext } from "../kubernetes-client.js";
import { RequestError, writeRejection } from "./errors.js";
import type { V1Namespace, V1Pod, V1SelfSubjectAccessReview } from "@kubernetes/client-node";

/** Request payload shapes matching src/contracts/kubernetes.ts */
export interface GetRequest {
  readonly gvk: { group: string; version: string; kind: string };
  readonly name: string;
  readonly namespace?: string;
}

export interface ListRequest {
  readonly gvk: { group: string; version: string; kind: string };
  readonly namespace?: string;
  readonly labelSelector?: string;
  readonly fieldSelector?: string;
  readonly limit?: number;
  readonly continue?: string;
}

export interface WriteRequest {
  readonly object: {
    apiVersion: string;
    kind: string;
    metadata: {
      name: string;
      namespace?: string;
      resourceVersion?: string;
      [key: string]: unknown;
    };
    spec?: unknown;
    [key: string]: unknown;
  };
  readonly expectedResourceVersion?: string;
  readonly verb: "create" | "update";
  readonly dryRun?: boolean;
}

const resources: Record<string, string> = {
  ClusterLogicPlatform: "clusterlogicplatforms",
  LogicFlowRuntime: "logicflowruntimes",
  LogicFlowDefinition: "logicflowdefinitions",
  LogicFlowService: "logicflowservices",
};

function logicPlural(gvk: GetRequest["gvk"]) {
  if (gvk.group !== "logic.kubesmarts.org" || gvk.version !== "v1" || !Object.hasOwn(resources, gvk.kind)) {
    throw new RequestError(400, "Unsupported Kubernetes resource");
  }
  return resources[gvk.kind];
}

function podImages(pod: V1Pod) {
  const { name, namespace, labels } = pod.metadata ?? {};
  return {
    apiVersion: "v1", kind: "Pod", metadata: { name, namespace, labels },
    spec: { containers: pod.spec?.containers.map(({ name, image }) => ({ name, image })) ?? [] },
    status: { phase: pod.status?.phase, containerStatuses: pod.status?.containerStatuses?.map(({ name, image, imageID }) => ({ name, image, imageID })) ?? [] },
  };
}

export async function handleGet(client: K8sClientContext, { gvk, name, namespace }: GetRequest) {
  if (gvk.group === "" && gvk.version === "v1") {
    if (gvk.kind === "Namespace") return client.coreApi.readNamespace({ name });
    if (gvk.kind === "Pod" && namespace) return podImages(await client.coreApi.readNamespacedPod({ name, namespace }));
  }
  const args = { group: gvk.group, version: gvk.version, plural: logicPlural(gvk), name };
  return namespace ? client.customApi.getNamespacedCustomObject({ ...args, namespace }) : client.customApi.getClusterCustomObject(args);
}

export async function handleList(client: K8sClientContext, req: ListRequest) {
  const { gvk, namespace, labelSelector, fieldSelector, limit } = req;
  const options = { labelSelector, fieldSelector, limit, _continue: req.continue };
  if (gvk.group === "" && gvk.version === "v1") {
    if (gvk.kind === "Namespace") return client.coreApi.listNamespace(options);
    if (gvk.kind === "Pod") {
      const list = namespace
        ? await client.coreApi.listNamespacedPod({ ...options, namespace })
        : await client.coreApi.listPodForAllNamespaces(options);
      return { ...list, items: list.items.map(podImages) };
    }
  }
  const args = { ...options, group: gvk.group, version: gvk.version, plural: logicPlural(gvk) };
  return namespace ? client.customApi.listNamespacedCustomObject({ ...args, namespace }) : client.customApi.listClusterCustomObject(args);
}

export async function handleWrite(client: K8sClientContext, req: WriteRequest) {
  try {
    const { object: body, verb } = req;
    const dryRun = req.dryRun ? "All" : undefined;
    if (!body || (verb !== "create" && verb !== "update")) throw new RequestError(400, "Expected a create or update candidate");
    if (verb === "create" && body.apiVersion === "authorization.k8s.io/v1" && body.kind === "SelfSubjectAccessReview") {
      return await client.authApi.createSelfSubjectAccessReview({ body: body as V1SelfSubjectAccessReview });
    }
    if (!body.metadata?.name) throw new RequestError(400, "Missing metadata.name");
    if (verb === "create" && body.kind === "Namespace" && body.apiVersion === "v1") {
      return await client.coreApi.createNamespace({ body: body as V1Namespace, dryRun });
    }
    const [group, version] = body.apiVersion.split("/");
    const plural = logicPlural({ group, version, kind: body.kind });
    if (body.kind === "LogicFlowService") throw new RequestError(400, "LogicFlowService is read-only");
    const { namespace, name } = body.metadata;
    if ((body.kind === "ClusterLogicPlatform") !== !namespace) throw new RequestError(400, "Incorrect resource scope");
    const args = { group, version, plural, dryRun, body };
    if (verb === "create") {
      return namespace ? await client.customApi.createNamespacedCustomObject({ ...args, namespace }) : await client.customApi.createClusterCustomObject(args);
    }
    if (!req.expectedResourceVersion || (body.metadata.resourceVersion && req.expectedResourceVersion !== body.metadata.resourceVersion)) {
      throw new RequestError(409, "The candidate must carry its loaded resource version");
    }
    // Editors retain the loaded token outside editable YAML.
    const replacement = { ...args, name, body: { ...body, metadata: { ...body.metadata, resourceVersion: req.expectedResourceVersion } } };
    return namespace ? await client.customApi.replaceNamespacedCustomObject({ ...replacement, namespace }) : await client.customApi.replaceClusterCustomObject(replacement);
  } catch (error) {
    throw writeRejection(error);
  }
}
