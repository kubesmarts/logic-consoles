import { createFetchGatewayTransport } from "./gateway-transport.ts";
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
  GroupVersionKind,
  WriteCandidate,
  WriteVerb,
  KubeObject,
  WriteError,
} from "../contracts/index.ts";

/** Direct browser configuration. */
export interface DirectBrowserConfig {
  readonly k8sApiUrl: string;
  readonly gatewayUrl: string;
  readonly token: string; // Short-lived token, in SESSION MEMORY only
}

const plural: Readonly<Record<string, string>> = {
  IngressClass: "ingressclasses",
  Ingress: "ingresses",
  NetworkPolicy: "networkpolicies",
};

function segment(value: string): string {
  if (!value || value === "." || value === ".." || value.includes("/")) {
    throw new Error("Invalid Kubernetes resource path.");
  }
  return encodeURIComponent(value);
}

function resourcePath(
  gvk: GroupVersionKind,
  namespace?: string,
  name?: string,
): string {
  const api = gvk.group ? `/apis/${segment(gvk.group)}` : "/api";
  const scope = namespace ? `/namespaces/${segment(namespace)}` : "";
  const resource = plural[gvk.kind] ?? `${gvk.kind.toLowerCase()}s`;
  return `${api}/${segment(gvk.version)}${scope}/${segment(resource)}${name ? "/" + segment(name) : ""}`;
}

async function kubernetesError(response: Response) {
  const status = response.status;
  const data = await response.json().catch(() => ({}));
  const message =
    typeof data.message === "string"
      ? data.message
      : `Kubernetes API returned HTTP ${status}.`;
  let writeError: WriteError;
  if (status === 409) writeError = { kind: "conflict" };
  else if (status === 403) writeError = { kind: "forbidden", reason: message };
  else if (status === 400 || status === 422) {
    const causes = data.details?.causes;
    const errors =
      Array.isArray(causes) && causes.length
        ? causes.map((cause) => ({
            path: String(cause.field ?? ""),
            message: String(cause.message ?? message),
          }))
        : [{ path: "", message }];
    writeError = { kind: "admission", errors };
  } else writeError = { kind: "server-error", status, detail: message };
  return Object.assign(new Error(message), {
    status,
    statusCode: status,
    writeError,
  });
}

export function createDirectBrowserAdapter(
  config: DirectBrowserConfig,
  sessionSignal?: AbortSignal,
): KubernetesTransport & GatewayTransport {
  async function request<T>(path: string, init: RequestInit): Promise<T> {
    sessionSignal?.throwIfAborted();
    const signal =
      sessionSignal && init.signal
        ? AbortSignal.any([sessionSignal, init.signal])
        : (sessionSignal ?? init.signal);
    let response: Response;
    try {
      response = await fetch(config.k8sApiUrl + path, {
        ...init,
        signal,
        redirect: "error",
        credentials: "omit",
        headers: {
          Authorization: `Bearer ${config.token}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
      });
    } catch (cause) {
      if (signal?.aborted) throw cause;
      throw Object.assign(new Error("Kubernetes API is unreachable."), {
        writeError: { kind: "unreachable" },
      });
    }
    if (!response.ok) throw await kubernetesError(response);
    return response.json() as Promise<T>;
  }

  async function write<TSpec, TStatus>(
    candidate: WriteCandidate<TSpec>,
    verb: WriteVerb,
    dryRun: boolean,
    signal?: AbortSignal,
  ): Promise<KubeObject<TSpec, TStatus>> {
    const { object, expectedResourceVersion } = candidate;
    const parts = object.apiVersion.split("/");
    const version = parts.pop() ?? "";
    if (
      verb === "update" &&
      (!expectedResourceVersion ||
        (object.metadata.resourceVersion &&
          expectedResourceVersion !== object.metadata.resourceVersion))
    ) {
      throw Object.assign(
        new Error("The update must carry the reviewed resourceVersion."),
        { writeError: { kind: "conflict" } },
      );
    }
    const path = resourcePath(
      { group: parts.join("/"), version, kind: object.kind },
      object.metadata.namespace,
      verb === "update" ? object.metadata.name : undefined,
    );
    const body =
      verb === "update"
        ? {
            ...object,
            metadata: {
              ...object.metadata,
              resourceVersion: expectedResourceVersion,
            },
          }
        : object;
    return request(path + (dryRun ? "?dryRun=All" : ""), {
      method: verb === "create" ? "POST" : "PUT",
      body: JSON.stringify(body),
      signal,
    });
  }

  return {
    get: (ref, signal) =>
      request(resourcePath(ref.gvk, ref.namespace, ref.name), { signal }),
    list: (gvk, { namespace, ...options }, signal) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options)) {
        if (value !== undefined) params.set(key, String(value));
      }
      const query = params.toString();
      return request(
        resourcePath(gvk, namespace) + (query ? "?" + query : ""),
        { signal },
      );
    },
    create: (candidate, signal) => write(candidate, "create", false, signal),
    update: (candidate, signal) => write(candidate, "update", false, signal),
    dryRun: (candidate, verb, signal) => write(candidate, verb, true, signal),
    ...createFetchGatewayTransport(config.gatewayUrl, sessionSignal),
  };
}
