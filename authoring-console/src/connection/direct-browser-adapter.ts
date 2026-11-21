/**
 * Direct-browser adapter - implements KubernetesTransport + GatewayTransport.
 *
 * ISOLATED from the launcher path. Holds a short-lived token in SESSION MEMORY only.
 * Sends it ONLY to the selected Kubernetes origin. For prepared clusters with browser-
 * reachable API servers and gateway Routes.
 *
 * SECURITY: Token is kept in memory, never persisted. URL + token are user-provided.
 * Both endpoints need browser-trusted certificates and CORS support where applicable.
 */
import type {
  KubernetesTransport,
  GatewayTransport,
  ResourceRef,
  GroupVersionKind,
  ListOptions,
  WriteCandidate,
  WriteVerb,
  KubeObject,
  KubeList,
  WorkflowVersionKey,
  WorkflowDocument,
  TopologyGraph,
  DefinitionResource,
  InstanceFilter,
  WorkflowInstance,
  GatewayLink,
  WorkflowInput,
  ExecuteAsyncResult,
  ExecuteSyncResult,
  InstanceActionResult,
} from "../contracts/index.ts";

/** Direct browser configuration. */
export interface DirectBrowserConfig {
  readonly k8sApiUrl: string;
  readonly gatewayUrl: string;
  readonly token: string; // Short-lived token, in SESSION MEMORY only
}

/**
 * Map GVK to plural resource name.
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

/** Build Kubernetes API path for a resource. */
const buildK8sPath = (
  gvk: GroupVersionKind,
  namespace?: string,
  name?: string
): string => {
  const plural = getPluralResource(gvk.kind);
  const apiBase = gvk.group === "" ? "/api/v1" : `/apis/${gvk.group}/${gvk.version}`;

  if (namespace) {
    const nsPath = `${apiBase}/namespaces/${namespace}/${plural}`;
    return name ? `${nsPath}/${name}` : nsPath;
  } else {
    return name ? `${apiBase}/${plural}/${name}` : `${apiBase}/${plural}`;
  }
};

/** Create direct-browser adapter implementing both transports. */
export const createDirectBrowserAdapter = (
  config: DirectBrowserConfig
): KubernetesTransport & GatewayTransport => {
  const authHeaders = {
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
  };

  // Kubernetes Transport implementation
  const get = async <TSpec = unknown, TStatus = unknown>(
    ref: ResourceRef,
    signal?: AbortSignal
  ): Promise<KubeObject<TSpec, TStatus>> => {
    const path = buildK8sPath(ref.gvk, ref.namespace, ref.name);
    const url = `${config.k8sApiUrl}${path}`;

    const response = await fetch(url, {
      headers: authHeaders,
      signal,
    });

    if (!response.ok) {
      throw new Error(`GET failed: ${response.statusText}`);
    }

    return response.json() as Promise<KubeObject<TSpec, TStatus>>;
  };

  const list = async <TSpec = unknown, TStatus = unknown>(
    gvk: GroupVersionKind,
    options: ListOptions,
    signal?: AbortSignal
  ): Promise<KubeList<KubeObject<TSpec, TStatus>>> => {
    const path = buildK8sPath(gvk, options.namespace);
    const params = new URLSearchParams();

    if (options.labelSelector) params.set("labelSelector", options.labelSelector);
    if (options.fieldSelector) params.set("fieldSelector", options.fieldSelector);
    if (options.limit) params.set("limit", String(options.limit));
    if (options.continue) params.set("continue", options.continue);

    const query = params.toString();
    const url = `${config.k8sApiUrl}${path}${query ? `?${query}` : ""}`;

    const response = await fetch(url, {
      headers: authHeaders,
      signal,
    });

    if (!response.ok) {
      throw new Error(`LIST failed: ${response.statusText}`);
    }

    return response.json() as Promise<KubeList<KubeObject<TSpec, TStatus>>>;
  };

  const dryRun = async <TSpec = unknown, TStatus = unknown>(
    candidate: WriteCandidate<TSpec>,
    verb: WriteVerb,
    signal?: AbortSignal
  ): Promise<KubeObject<TSpec, TStatus>> => {
    const { object } = candidate;
    const parts = object.apiVersion.split("/");
    const group = parts.length === 2 ? parts[0] ?? "" : "";
    const version = parts.length === 2 ? parts[1] ?? "" : parts[0] ?? "";

    const gvk = { group, version, kind: object.kind };
    const path = buildK8sPath(gvk, object.metadata.namespace, verb === "update" ? object.metadata.name : undefined);
    const url = `${config.k8sApiUrl}${path}?dryRun=All`;

    const response = await fetch(url, {
      method: verb === "create" ? "POST" : "PUT",
      headers: authHeaders,
      body: JSON.stringify(object),
      signal,
    });

    if (!response.ok) {
      throw new Error(`DRY RUN failed: ${response.statusText}`);
    }

    return response.json() as Promise<KubeObject<TSpec, TStatus>>;
  };

  const create = async <TSpec = unknown, TStatus = unknown>(
    candidate: WriteCandidate<TSpec>,
    signal?: AbortSignal
  ): Promise<KubeObject<TSpec, TStatus>> => {
    const { object } = candidate;
    const parts = object.apiVersion.split("/");
    const group = parts.length === 2 ? parts[0] ?? "" : "";
    const version = parts.length === 2 ? parts[1] ?? "" : parts[0] ?? "";

    const gvk = { group, version, kind: object.kind };
    const path = buildK8sPath(gvk, object.metadata.namespace);
    const url = `${config.k8sApiUrl}${path}`;

    const response = await fetch(url, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(object),
      signal,
    });

    if (!response.ok) {
      throw new Error(`CREATE failed: ${response.statusText}`);
    }

    return response.json() as Promise<KubeObject<TSpec, TStatus>>;
  };

  const update = async <TSpec = unknown, TStatus = unknown>(
    candidate: WriteCandidate<TSpec>,
    signal?: AbortSignal
  ): Promise<KubeObject<TSpec, TStatus>> => {
    const { object } = candidate;
    const parts = object.apiVersion.split("/");
    const group = parts.length === 2 ? parts[0] ?? "" : "";
    const version = parts.length === 2 ? parts[1] ?? "" : parts[0] ?? "";

    const gvk = { group, version, kind: object.kind };
    const path = buildK8sPath(gvk, object.metadata.namespace, object.metadata.name);
    const url = `${config.k8sApiUrl}${path}`;

    const response = await fetch(url, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify(object),
      signal,
    });

    if (!response.ok) {
      throw new Error(`UPDATE failed: ${response.statusText}`);
    }

    return response.json() as Promise<KubeObject<TSpec, TStatus>>;
  };

  // Gateway Transport implementation
  const gatewayHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const getTopology = async (namespace: string, signal?: AbortSignal): Promise<TopologyGraph> => {
    const url = `${config.gatewayUrl}/v1/topology?namespace=${encodeURIComponent(namespace)}`;
    const response = await fetch(url, { headers: gatewayHeaders, signal });

    if (!response.ok) {
      throw new Error(`GET topology failed: ${response.statusText}`);
    }

    return response.json() as Promise<TopologyGraph>;
  };

  const listDefinitions = async (signal?: AbortSignal): Promise<readonly DefinitionResource[]> => {
    const url = `${config.gatewayUrl}/v1/definitions/`;
    const response = await fetch(url, { headers: gatewayHeaders, signal });

    if (!response.ok) {
      throw new Error(`LIST definitions failed: ${response.statusText}`);
    }

    return response.json() as Promise<readonly DefinitionResource[]>;
  };

  const getDefinition = async (
    key: WorkflowVersionKey,
    signal?: AbortSignal
  ): Promise<WorkflowDocument> => {
    const url = `${config.gatewayUrl}/v1/definitions/${encodeURIComponent(key.namespace)}/${encodeURIComponent(key.workflowName)}/${encodeURIComponent(key.version)}`;
    const response = await fetch(url, { headers: gatewayHeaders, signal });

    if (!response.ok) {
      throw new Error(`GET definition failed: ${response.statusText}`);
    }

    return response.json() as Promise<WorkflowDocument>;
  };

  const listInstances = async (
    filter: InstanceFilter,
    signal?: AbortSignal
  ): Promise<readonly WorkflowInstance[]> => {
    const params = new URLSearchParams();
    if (filter.namespace) params.set("namespace", filter.namespace);
    if (filter.name) params.set("name", filter.name);
    if (filter.version) params.set("version", filter.version);
    if (filter.status) params.set("status", filter.status);

    const query = params.toString();
    const url = `${config.gatewayUrl}/v1/instances/${query ? `?${query}` : ""}`;
    const response = await fetch(url, { headers: gatewayHeaders, signal });

    if (!response.ok) {
      throw new Error(`LIST instances failed: ${response.statusText}`);
    }

    return response.json() as Promise<readonly WorkflowInstance[]>;
  };

  const getInstance = async (id: string, signal?: AbortSignal): Promise<WorkflowInstance> => {
    const url = `${config.gatewayUrl}/v1/instances/${encodeURIComponent(id)}`;
    const response = await fetch(url, { headers: gatewayHeaders, signal });

    if (!response.ok) {
      throw new Error(`GET instance failed: ${response.statusText}`);
    }

    return response.json() as Promise<WorkflowInstance>;
  };

  const execute = async (
    link: GatewayLink,
    input: WorkflowInput,
    signal?: AbortSignal
  ): Promise<ExecuteAsyncResult> => {
    const url = `${config.gatewayUrl}${link.href}`;
    const response = await fetch(url, {
      method: "POST",
      headers: gatewayHeaders,
      body: JSON.stringify(input),
      signal,
    });

    if (!response.ok) {
      throw new Error(`EXECUTE failed: ${response.statusText}`);
    }

    return response.json() as Promise<ExecuteAsyncResult>;
  };

  const executeSync = async (
    link: GatewayLink,
    input: WorkflowInput,
    signal?: AbortSignal
  ): Promise<ExecuteSyncResult> => {
    const url = `${config.gatewayUrl}${link.href}`;
    const response = await fetch(url, {
      method: "POST",
      headers: gatewayHeaders,
      body: JSON.stringify(input),
      signal,
    });

    if (!response.ok) {
      throw new Error(`EXECUTE SYNC failed: ${response.statusText}`);
    }

    return response.json() as Promise<ExecuteSyncResult>;
  };

  const suspendInstance = async (
    link: GatewayLink,
    instanceId: string,
    signal?: AbortSignal
  ): Promise<InstanceActionResult> => {
    const href = link.href.replace("{id}", encodeURIComponent(instanceId));
    const url = `${config.gatewayUrl}${href}`;
    const response = await fetch(url, {
      method: "POST",
      headers: gatewayHeaders,
      signal,
    });

    return {
      instanceId,
      httpStatus: response.status,
      raw: await response.json(),
    };
  };

  const resumeInstance = async (
    link: GatewayLink,
    instanceId: string,
    signal?: AbortSignal
  ): Promise<InstanceActionResult> => {
    const href = link.href.replace("{id}", encodeURIComponent(instanceId));
    const url = `${config.gatewayUrl}${href}`;
    const response = await fetch(url, {
      method: "POST",
      headers: gatewayHeaders,
      signal,
    });

    return {
      instanceId,
      httpStatus: response.status,
      raw: await response.json(),
    };
  };

  const cancelInstance = async (
    link: GatewayLink,
    instanceId: string,
    signal?: AbortSignal
  ): Promise<InstanceActionResult> => {
    const href = link.href.replace("{id}", encodeURIComponent(instanceId));
    const url = `${config.gatewayUrl}${href}`;
    const response = await fetch(url, {
      method: "POST",
      headers: gatewayHeaders,
      signal,
    });

    return {
      instanceId,
      httpStatus: response.status,
      raw: await response.json(),
    };
  };

  return {
    // KubernetesTransport
    get,
    list,
    dryRun,
    create,
    update,
    // GatewayTransport
    getTopology,
    listDefinitions,
    getDefinition,
    listInstances,
    getInstance,
    execute,
    executeSync,
    suspendInstance,
    resumeInstance,
    cancelInstance,
  };
};
