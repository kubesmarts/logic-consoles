/**
 * A fetch-based GatewayTransport over the verified gateway HTTP routes. In tests and
 * dev it talks to MSW (src/fixtures/msw); against a real deployment the same code
 * talks to the gateway. HTTP status codes are translated to the typed GatewayError
 * taxonomy so consumers can branch on unreachable / 503 / 502 / denied, and an empty
 * list is returned as a successful empty array (not an error).
 */
import type {
  DefinitionResource,
  ExecuteAsyncResult,
  ExecuteSyncResult,
  GatewayError,
  GatewayLink,
  GatewayTransport,
  InstanceActionResult,
  InstanceFilter,
  TopologyGraph,
  WorkflowDocument,
  WorkflowInput,
  WorkflowInstance,
  WorkflowVersionKey,
} from "../contracts/index.ts";

const toGatewayError = (status: number): GatewayError => {
  switch (status) {
    case 503:
      return { kind: "index-pending" };
    case 504:
      return { kind: "unreachable", detail: "Gateway timeout" };
    case 502:
      return { kind: "upstream-error" };
    case 401:
    case 403:
      return { kind: "denied" };
    default:
      return { kind: "upstream-error", detail: `Unexpected status ${status}` };
  }
};

export const createFetchGatewayTransport = (baseUrl: string, sessionSignal?: AbortSignal): GatewayTransport => {
  const url = (path: string): string => `${baseUrl}${path}`;

  const call = async (path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> => {
    sessionSignal?.throwIfAborted();
    const requestSignal = sessionSignal && signal ? AbortSignal.any([sessionSignal, signal]) : sessionSignal ?? signal;
    let response: Response;
    try {
      if (!baseUrl) throw new Error("Configure a gateway URL to use this action.");
      const target = new URL(url(path));
      if (target.origin !== new URL(baseUrl).origin) throw new Error("Invalid gateway origin");
      response = await fetch(target.href, { ...init, signal: requestSignal, redirect: "error", credentials: "omit" });
    } catch (cause) {
      if (requestSignal?.aborted) throw requestSignal.reason;
      const error: GatewayError = { kind: "unreachable", detail: String(cause) };
      throw error;
    }
    return response;
  };

  const getJson = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
    const response = await call(path, { method: "GET" }, signal);
    if (!response.ok) {
      throw toGatewayError(response.status);
    }
    return (await response.json()) as T;
  };

  const postJson = async (link: GatewayLink, body: unknown, signal?: AbortSignal): Promise<Response> => {
    const response = await call(
      link.href,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      signal,
    );
    return response;
  };

  return {
    getTopology: (namespace, signal) =>
      getJson<TopologyGraph>(`/v1/topology?namespace=${encodeURIComponent(namespace)}`, signal),

    listDefinitions: (signal) => getJson<readonly DefinitionResource[]>("/v1/definitions/", signal),

    getDefinition: (key: WorkflowVersionKey, signal) =>
      getJson<WorkflowDocument>(
        `/v1/definitions/${encodeURIComponent(key.namespace)}/${encodeURIComponent(key.workflowName)}/${encodeURIComponent(key.version)}`,
        signal,
      ),

    listInstances: (filter: InstanceFilter, signal) => {
      const params = new URLSearchParams();
      if (filter.namespace) params.set("namespace", filter.namespace);
      if (filter.name) params.set("name", filter.name);
      if (filter.version) params.set("version", filter.version);
      if (filter.status) params.set("status", filter.status);
      return getJson<readonly WorkflowInstance[]>(`/v1/instances/?${params.toString()}`, signal);
    },

    getInstance: (id, signal) => getJson<WorkflowInstance>(`/v1/instances/${encodeURIComponent(id)}`, signal),

    execute: async (link, input: WorkflowInput, signal): Promise<ExecuteAsyncResult> => {
      const response = await postJson(link, input, signal);
      if (response.status !== 202) {
        throw toGatewayError(response.status);
      }
      const raw = (await response.json()) as Record<string, unknown>;
      if (!raw || typeof raw.instanceId !== "string" || !raw.instanceId) {
        throw new Error("The gateway accepted the run without returning an instance ID.");
      }
      return {
        instanceId: raw["instanceId"],
        ...(typeof raw["workflowApplicationId"] === "string"
          ? { workflowApplicationId: raw["workflowApplicationId"] }
          : {}),
        raw,
      };
    },

    executeSync: async (link, input: WorkflowInput, signal): Promise<ExecuteSyncResult> => {
      const response = await postJson(link, input, signal);
      if (response.status !== 200) {
        throw toGatewayError(response.status);
      }
      const raw = (await response.json()) as Record<string, unknown>;
      return { output: raw && typeof raw === "object" && "workflowdata" in raw ? raw.workflowdata : raw, raw };
    },

    suspendInstance: (link, instanceId, signal) => runInstanceAction(call, link, instanceId, signal),
    resumeInstance: (link, instanceId, signal) => runInstanceAction(call, link, instanceId, signal),
    cancelInstance: (link, instanceId, signal) => runInstanceAction(call, link, instanceId, signal),
  };
};

const runInstanceAction = async (
  call: (path: string, init: RequestInit, signal?: AbortSignal) => Promise<Response>,
  link: GatewayLink,
  instanceId: string,
  signal?: AbortSignal,
): Promise<InstanceActionResult> => {
  const path = link.href.replace("{id}", encodeURIComponent(instanceId));
  const response = await call(path, { method: "POST" }, signal);
  const raw: unknown = await response.json().catch(() => null);
  return { instanceId, httpStatus: response.status, raw };
};
