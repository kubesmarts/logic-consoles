/**
 * Launcher adapter - implements KubernetesTransport + GatewayTransport.
 *
 * Calls the launcher's same-origin loopback API and maps HTTP responses to the
 * typed contract shapes. Sends session+context headers on every request; discards
 * late responses whose key no longer matches.
 */
import type {
  KubernetesTransport,
  GatewayTransport,
  SessionScopedKey,
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

/** Launcher API client configuration. */
export interface LauncherAdapterConfig {
  readonly baseUrl: string;
  readonly getSessionKey: () => SessionScopedKey;
}

/** Make authenticated request to launcher API. */
const fetchLauncher = async <T>(
  config: LauncherAdapterConfig,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
  } = {}
): Promise<T> => {
  const sessionKey = config.getSessionKey();
  const url = `${config.baseUrl}${path}`;

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": sessionKey.sessionId,
      "X-Context-Name": sessionKey.contextName,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));

    // Check if response indicates session/context mismatch
    if (response.status === 409 && (error.kind === "session-changed" || error.error === "Session mismatch")) {
      throw new Error("Session or context changed - request invalidated");
    }

    if (path.startsWith("/api/k8s/")) {
      throw Object.assign(new Error(error.message ?? error.error ?? `Kubernetes API returned HTTP ${response.status}.`),
        {...error, status: response.status, statusCode: response.status});
    }
    throw error;
  }

  return response.json() as Promise<T>;
};

/** Create launcher adapter implementing both transports. */
export const createLauncherAdapter = (
  config: LauncherAdapterConfig
): KubernetesTransport & GatewayTransport => {
  // Kubernetes Transport implementation
  const get = async <TSpec = unknown, TStatus = unknown>(
    ref: ResourceRef,
    signal?: AbortSignal
  ): Promise<KubeObject<TSpec, TStatus>> => {
    return fetchLauncher<KubeObject<TSpec, TStatus>>(config, "/api/k8s/get", {
      method: "POST",
      body: ref,
      signal,
    });
  };

  const list = async <TSpec = unknown, TStatus = unknown>(
    gvk: GroupVersionKind,
    options: ListOptions,
    signal?: AbortSignal
  ): Promise<KubeList<KubeObject<TSpec, TStatus>>> => {
    return fetchLauncher<KubeList<KubeObject<TSpec, TStatus>>>(config, "/api/k8s/list", {
      method: "POST",
      body: { gvk, ...options },
      signal,
    });
  };

  const dryRun = async <TSpec = unknown, TStatus = unknown>(
    candidate: WriteCandidate<TSpec>,
    verb: WriteVerb,
    signal?: AbortSignal
  ): Promise<KubeObject<TSpec, TStatus>> => {
    return fetchLauncher<KubeObject<TSpec, TStatus>>(config, "/api/k8s/write", {
      method: "POST",
      body: { ...candidate, verb, dryRun: true },
      signal,
    });
  };

  const create = async <TSpec = unknown, TStatus = unknown>(
    candidate: WriteCandidate<TSpec>,
    signal?: AbortSignal
  ): Promise<KubeObject<TSpec, TStatus>> => {
    return fetchLauncher<KubeObject<TSpec, TStatus>>(config, "/api/k8s/write", {
      method: "POST",
      body: { ...candidate, verb: "create", dryRun: false },
      signal,
    });
  };

  const update = async <TSpec = unknown, TStatus = unknown>(
    candidate: WriteCandidate<TSpec>,
    signal?: AbortSignal
  ): Promise<KubeObject<TSpec, TStatus>> => {
    return fetchLauncher<KubeObject<TSpec, TStatus>>(config, "/api/k8s/write", {
      method: "POST",
      body: { ...candidate, verb: "update", dryRun: false },
      signal,
    });
  };

  // Gateway Transport implementation
  const getTopology = async (namespace: string, signal?: AbortSignal): Promise<TopologyGraph> => {
    return fetchLauncher<TopologyGraph>(
      config,
      `/api/gateway/topology?namespace=${encodeURIComponent(namespace)}`,
      { signal }
    );
  };

  const listDefinitions = async (signal?: AbortSignal): Promise<readonly DefinitionResource[]> => {
    return fetchLauncher<readonly DefinitionResource[]>(config, "/api/gateway/definitions", { signal });
  };

  const getDefinition = async (
    key: WorkflowVersionKey,
    signal?: AbortSignal
  ): Promise<WorkflowDocument> => {
    const path = `/api/gateway/definition/${encodeURIComponent(key.namespace)}/${encodeURIComponent(key.workflowName)}/${encodeURIComponent(key.version)}`;
    return fetchLauncher<WorkflowDocument>(config, path, { signal });
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
    const path = query ? `/api/gateway/instances?${query}` : "/api/gateway/instances";

    return fetchLauncher<readonly WorkflowInstance[]>(config, path, { signal });
  };

  const getInstance = async (id: string, signal?: AbortSignal): Promise<WorkflowInstance> => {
    return fetchLauncher<WorkflowInstance>(config, `/api/gateway/instance/${encodeURIComponent(id)}`, {
      signal,
    });
  };

  const execute = async (
    link: GatewayLink,
    input: WorkflowInput,
    signal?: AbortSignal
  ): Promise<ExecuteAsyncResult> => {
    return fetchLauncher<ExecuteAsyncResult>(config, "/api/gateway/execute", {
      method: "POST",
      body: { href: link.href, input },
      signal,
    });
  };

  const executeSync = async (
    link: GatewayLink,
    input: WorkflowInput,
    signal?: AbortSignal
  ): Promise<ExecuteSyncResult> => {
    return fetchLauncher<ExecuteSyncResult>(config, "/api/gateway/execute-sync", {
      method: "POST",
      body: { href: link.href, input },
      signal,
    });
  };

  const suspendInstance = async (
    link: GatewayLink,
    instanceId: string,
    signal?: AbortSignal
  ): Promise<InstanceActionResult> => {
    return fetchLauncher<InstanceActionResult>(config, "/api/gateway/instance-action", {
      method: "POST",
      body: { linkHref: link.href, instanceId },
      signal,
    });
  };

  const resumeInstance = async (
    link: GatewayLink,
    instanceId: string,
    signal?: AbortSignal
  ): Promise<InstanceActionResult> => {
    return fetchLauncher<InstanceActionResult>(config, "/api/gateway/instance-action", {
      method: "POST",
      body: { linkHref: link.href, instanceId },
      signal,
    });
  };

  const cancelInstance = async (
    link: GatewayLink,
    instanceId: string,
    signal?: AbortSignal
  ): Promise<InstanceActionResult> => {
    return fetchLauncher<InstanceActionResult>(config, "/api/gateway/instance-action", {
      method: "POST",
      body: { linkHref: link.href, instanceId },
      signal,
    });
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
