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
    const { status, body } = gatewayError;

    if (status === 0) {
      return { kind: "unreachable", detail: String(body) };
    }

    if (status === 503) {
      return { kind: "index-pending" };
    }

    if (status === 502) {
      return { kind: "upstream-error", detail: JSON.stringify(body) };
    }

    if (status === 403) {
      return { kind: "denied", reason: JSON.stringify(body) };
    }

    // Other errors map to upstream-error
    return { kind: "upstream-error", detail: JSON.stringify(body) };
  }

  return { kind: "unreachable", detail: error instanceof Error ? error.message : String(error) };
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
    const validatedPath = validateGatewayHref(href, config);

    const response = await fetchGateway(config, validatedPath, {
      method: "POST",
      body: input,
      signal,
    });
    return response.data;
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
    const validatedPath = validateGatewayHref(href, config);

    const response = await fetchGateway(config, validatedPath, {
      method: "POST",
      body: input,
      signal,
    });
    return response.data;
  } catch (error) {
    throw mapToGatewayError(error);
  }
};

/**
 * Handle instance action (suspend/resume/cancel).
 * SECURITY: linkHref is UNTRUSTED browser input - validate before use.
 */
export const handleInstanceAction = async (
  config: GatewayClientConfig,
  linkHref: string,
  instanceId: string,
  signal?: AbortSignal
): Promise<unknown> => {
  try {
    // Validate linkHref BEFORE substitution (SSRF prevention)
    const validatedPath = validateGatewayHref(linkHref, config);

    // Substitute {id} in the validated templated link
    const href = validatedPath.replace("{id}", encodeURIComponent(instanceId));

    const response = await fetchGateway(config, href, {
      method: "POST",
      signal,
    });

    return {
      instanceId,
      httpStatus: response.status,
      raw: response.data,
    };
  } catch (error) {
    throw mapToGatewayError(error);
  }
};
