/**
 * Kubernetes API request handlers for the launcher.
 *
 * Implements GET/LIST/DRYRUN/CREATE/UPDATE operations using the selected kubeconfig context.
 * Maps @kubernetes/client-node responses to the contracts/kubernetes.ts types.
 */
import type { K8sClientContext } from "../kubernetes-client.js";
import { getK8sErrorStatus, getK8sErrorBody, isK8sError } from "../kubernetes-client.js";

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

/**
 * Map GVK to the plural resource name.
 * Simplified mapping; complete implementation would use API discovery.
 */
const getPluralResource = (kind: string): string => {
  const mappings: Record<string, string> = {
    Namespace: "namespaces",
    ClusterLogicPlatform: "clusterlogicplatforms",
    LogicFlowRuntime: "logicflowruntimes",
    LogicFlowDefinition: "logicflowdefinitions",
    LogicFlowService: "logicflowservices",
  };
  return mappings[kind] ?? `${kind.toLowerCase()}s`;
};

/** Map K8s client error to WriteError shape. */
const mapToWriteError = (error: unknown): unknown => {
  if (!isK8sError(error)) {
    return {
      kind: "unreachable",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const status = getK8sErrorStatus(error);
  const body = getK8sErrorBody(error);

  if (status === 403) {
    return { kind: "forbidden", reason: JSON.stringify(body) };
  }

  if (status === 409) {
    return { kind: "conflict" };
  }

  if (status === 422 || status === 400) {
    // Admission/validation error - try to extract field errors
    const errors: Array<{ path: string; message: string }> = [];

    if (typeof body === "object" && body !== null && "message" in body) {
      errors.push({ path: "", message: String(body.message) });
    }

    return { kind: "admission", errors };
  }

  if (status && status >= 500) {
    return { kind: "server-error", status, detail: JSON.stringify(body) };
  }

  return { kind: "server-error", status, detail: JSON.stringify(body) };
};

/** Handle GET request. */
export const handleGet = async (
  client: K8sClientContext,
  req: GetRequest
): Promise<unknown> => {
  const { gvk, name, namespace } = req;
  const plural = getPluralResource(gvk.kind);

  if (gvk.group === "") {
    // Core API - special handling for namespaces
    if (gvk.kind === "Namespace") {
      const result = await client.coreApi.readNamespace({ name });
      return result;
    }
    throw new Error(`Unsupported core kind for GET: ${gvk.kind}`);
  } else {
    // Custom API
    const result = namespace
      ? await client.customApi.getNamespacedCustomObject({
          group: gvk.group,
          version: gvk.version,
          namespace,
          plural,
          name,
        })
      : await client.customApi.getClusterCustomObject({
          group: gvk.group,
          version: gvk.version,
          plural,
          name,
        });
    return result;
  }
};

/** Handle LIST request. */
export const handleList = async (
  client: K8sClientContext,
  req: ListRequest
): Promise<unknown> => {
  const { gvk, namespace, labelSelector, fieldSelector, limit } = req;
  const plural = getPluralResource(gvk.kind);

  if (gvk.group === "") {
    // Core API
    if (gvk.kind === "Namespace") {
      const result = await client.coreApi.listNamespace({
        fieldSelector,
        labelSelector,
        limit,
      });
      return result;
    }
    throw new Error(`Unsupported core kind for LIST: ${gvk.kind}`);
  } else {
    // Custom API
    const result = namespace
      ? await client.customApi.listNamespacedCustomObject({
          group: gvk.group,
          version: gvk.version,
          namespace,
          plural,
          fieldSelector,
          labelSelector,
          limit,
        })
      : await client.customApi.listClusterCustomObject({
          group: gvk.group,
          version: gvk.version,
          plural,
          fieldSelector,
          labelSelector,
          limit,
        });
    return result;
  }
};

/** Handle CREATE or UPDATE request. */
export const handleWrite = async (
  client: K8sClientContext,
  req: WriteRequest
): Promise<unknown> => {
  const { object, verb, dryRun } = req;
  const { kind, metadata } = object;
  const namespace = metadata.namespace;

  const parts = object.apiVersion.split("/");
  const group = parts.length === 2 ? parts[0] ?? "" : "";
  const version = parts.length === 2 ? parts[1] ?? "" : parts[0] ?? "";

  const plural = getPluralResource(kind);
  const dryRunParam = dryRun ? "All" : undefined;

  try {
    if (verb === "create") {
      if (group === "") {
        // Core API
        if (kind === "Namespace") {
          const result = await client.coreApi.createNamespace({
            body: object as never,
            dryRun: dryRunParam,
          });
          return result;
        }
        throw new Error(`Unsupported core kind for CREATE: ${kind}`);
      } else {
        // Custom API
        const result = namespace
          ? await client.customApi.createNamespacedCustomObject({
              group,
              version,
              namespace,
              plural,
              body: object,
              dryRun: dryRunParam,
            })
          : await client.customApi.createClusterCustomObject({
              group,
              version,
              plural,
              body: object,
              dryRun: dryRunParam,
            });
        return result;
      }
    } else {
      // UPDATE - use replace (PUT)
      if (group === "") {
        throw new Error(`Unsupported core kind for UPDATE: ${kind}`);
      } else {
        const result = namespace
          ? await client.customApi.replaceNamespacedCustomObject({
              group,
              version,
              namespace,
              plural,
              name: metadata.name,
              body: object,
              dryRun: dryRunParam,
            })
          : await client.customApi.replaceClusterCustomObject({
              group,
              version,
              plural,
              name: metadata.name,
              body: object,
              dryRun: dryRunParam,
            });
        return result;
      }
    }
  } catch (error) {
    // Map to WriteError for creates/updates
    throw { writeError: mapToWriteError(error) };
  }
};
