/**
 * Gateway API request handlers for the launcher.
 *
 * Implements topology/definitions/instances/execute operations via the gateway HTTP API.
 * Maps HTTP errors to src/contracts/errors.ts GatewayError taxonomy.
 */
import type { GatewayClientConfig, GatewayErrorResponse } from "../gateway-client.js";
import { fetchGateway, validateGatewayHref } from "../gateway-client.js";

/** Map HTTP error to GatewayError shape from contracts/errors.ts */
const mapToGatewayError = (error: unknown): unknown => {
  if (typeof error === "object" && error !== null && "status" in error) {
    const gatewayError = error as GatewayErrorResponse;
    const { status } = gatewayError;

    if (status === 0) {
      return { kind: "unreachable", status: 503, detail: "Gateway connection failed" };
    }

    if (status === 503) {
      return { kind: "index-pending", status };
    }

    if (status === 502) {
      return { kind: "upstream-error", status, detail: `Gateway returned HTTP ${status}` };
    }

    if (status === 403) {
      return { kind: "denied", status, reason: "Gateway denied access" };
    }

    // Other errors map to upstream-error
    return { kind: "upstream-error", status, detail: `Gateway returned HTTP ${status}` };
  }

  return { kind: "unreachable", status: 400, detail: "Invalid gateway request" };
};

/** Handle GET /v1/topology?namespace={ns} */
export const handleGetTopology = async (
  config: GatewayClientConfig,
  namespace: string,
  signal?: AbortSignal
): Promise<unknown> => {
  try {
    const response = await fetchGateway(
      config,
      `/v1/topology?namespace=${encodeURIComponent(namespace)}`,
      { signal }
    );
    return response.data;
  } catch (error) {
    throw mapToGatewayError(error);
  }
};

/** Handle GET /v1/definitions/ */
export const handleListDefinitions = async (
  config: GatewayClientConfig,
  signal?: AbortSignal
): Promise<unknown> => {
  try {
    const response = await fetchGateway(config, "/v1/definitions/", { signal });
    return response.data;
  } catch (error) {
    throw mapToGatewayError(error);
  }
};

/** Handle GET /v1/definitions/{namespace}/{name}/{version} */
export const handleGetDefinition = async (
  config: GatewayClientConfig,
  namespace: string,
  name: string,
  version: string,
  signal?: AbortSignal
): Promise<unknown> => {
  try {
    const path = `/v1/definitions/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
    const response = await fetchGateway(config, path, { signal });
    return response.data;
  } catch (error) {
    throw mapToGatewayError(error);
  }
};

/** Handle GET /v1/instances/ with optional filters */
export const handleListInstances = async (
  config: GatewayClientConfig,
  filters: {
    namespace?: string;
    name?: string;
    version?: string;
    status?: string;
  },
  signal?: AbortSignal
): Promise<unknown> => {
  try {
    const params = new URLSearchParams();
    if (filters.namespace) params.set("namespace", filters.namespace);
    if (filters.name) params.set("name", filters.name);
    if (filters.version) params.set("version", filters.version);
    if (filters.status) params.set("status", filters.status);

    const query = params.toString();
    const path = query ? `/v1/instances/?${query}` : "/v1/instances/";

    const response = await fetchGateway(config, path, { signal });
    return response.data;
  } catch (error) {
    throw mapToGatewayError(error);
  }
};

/** Handle GET /v1/instances/{id} */
export const handleGetInstance = async (
  config: GatewayClientConfig,
  id: string,
  signal?: AbortSignal
): Promise<unknown> => {
  try {
    const response = await fetchGateway(config, `/v1/instances/${encodeURIComponent(id)}`, { signal });
    return response.data;
  } catch (error) {
    throw mapToGatewayError(error);
  }
};

/** Validate the exact versioned route before submitting a mutation. */
function runtimePath(config: GatewayClientConfig, href: string, operation: "async" | "sync" | "instance") {
  const path = validateGatewayHref(href, config);
  const parts = path.split("/");
  if (href !== path || /[?#]/.test(path) || parts[1] !== "v1" || parts[2] !== "runtime") {
    throw new Error("Invalid runtime link");
  }
  // Go's router reserves the versionless /sync endpoint.
  if (parts.length < 6 || parts.slice(3, 6).some(value => !value || /[/\\?#{}]/.test(decodeURIComponent(value))) || parts[5] === "sync") {
    throw new Error("Missing runtime identity");
  }
  if (operation === "async" && parts.length === 6) return path;
  if (operation === "sync" && parts.length === 7 && parts[6] === "sync") return path;
  if (operation === "instance" && parts.length === 9 && parts[6] === "instance" && parts[7] && ["suspend", "resume", "cancel"].includes(parts[8])) return path;
  throw new Error("Unexpected runtime operation");
}

/**
 * Handle POST to execute link (async).
 * SECURITY: href is UNTRUSTED browser input - validate before use.
 */
export const handleExecute = async (
  config: GatewayClientConfig,
  href: string,
  input: unknown,
  signal?: AbortSignal
): Promise<unknown> => {
  try {
    // Validate and constrain href to gateway origin (SSRF prevention)
    const validatedPath = runtimePath(config, href, "async");

    const response = await fetchGateway(config, validatedPath, {
      method: "POST",
      body: input,
      signal,
    });
    const raw = response.data as { instanceId?: string; workflowApplicationId?: string } | null;
    if (response.status !== 202 || typeof raw?.instanceId !== "string" || !raw.instanceId) {
      throw { status: 502 };
    }
    return { instanceId: raw.instanceId, workflowApplicationId: raw.workflowApplicationId, raw };
  } catch (error) {
    throw mapToGatewayError(error);
  }
};

/**
 * Handle POST to executeSync link.
 * SECURITY: href is UNTRUSTED browser input - validate before use.
 */
export const handleExecuteSync = async (
  config: GatewayClientConfig,
  href: string,
  input: unknown,
  signal?: AbortSignal
): Promise<unknown> => {
  try {
    // Validate and constrain href to gateway origin (SSRF prevention)
    const validatedPath = runtimePath(config, href, "sync");

    const response = await fetchGateway(config, validatedPath, {
      method: "POST",
      body: input,
      signal,
    });
    if (response.status !== 200) throw { status: 502 };
    const raw = response.data;
    const output = raw && typeof raw === "object" && "workflowdata" in raw ? raw.workflowdata : raw;
    return { output, raw };
  } catch (error) {
    throw mapToGatewayError(error);
  }
};

/**
 * Handle instance action (suspend/resume/cancel).
 * SECURITY: linkHref is UNTRUSTED browser input - validate after substitution.
 *
 * Template substitution happens FIRST, then validation:
 * 1. Substitute {id} with encodeURIComponent(instanceId) - prevents injection
 * 2. Validate the concrete path - ensures it's gateway-relative and safe
 *
 * This ordering prevents the validator's URL encoding from breaking the template match
 * while still protecting against SSRF (the final concrete path is validated).
 */
export const handleInstanceAction = async (
  config: GatewayClientConfig,
  linkHref: string,
  instanceId: string,
  signal?: AbortSignal
): Promise<unknown> => {
  try {
    // Substitute {id} FIRST - encodeURIComponent prevents instanceId from injecting /, //, :, etc.
    if (!linkHref.endsWith("/instance/{id}/suspend") && !linkHref.endsWith("/instance/{id}/resume") && !linkHref.endsWith("/instance/{id}/cancel")) {
      throw new Error("Expected a templated instance action");
    }
    const concreteHref = linkHref.replace("{id}", encodeURIComponent(instanceId));

    // THEN validate the concrete path (SSRF prevention on the final path)
    const validatedPath = runtimePath(config, concreteHref, "instance");

    const response = await fetchGateway(config, validatedPath, {
      method: "POST",
      signal,
    });

    return {
      instanceId,
      httpStatus: response.status,
      raw: response.data,
    };
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && "body" in error) {
      const { status, body } = error as GatewayErrorResponse;
      if (status >= 400) return { instanceId, httpStatus: status, raw: body };
    }
    throw mapToGatewayError(error);
  }
};
