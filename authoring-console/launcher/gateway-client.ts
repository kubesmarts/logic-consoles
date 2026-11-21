/**
 * Gateway HTTP client for the launcher.
 *
 * Discovers the gateway address from the platform and calls it over the workstation network.
 * Validates its certificate when HTTPS. The gateway uses its own service account for K8s discovery.
 */
import * as https from "node:https";

export interface GatewayClientConfig {
  readonly baseUrl: string;
  /** Validate HTTPS certificates (default: true). Set false only for local dev. */
  readonly validateCerts?: boolean;
}

export interface GatewayResponse<T> {
  readonly status: number;
  readonly data: T;
}

export interface GatewayErrorResponse {
  readonly status: number;
  readonly body: unknown;
}

/**
 * Make an HTTP request to the gateway.
 * Returns response data on success, throws GatewayErrorResponse on HTTP error.
 */
export const fetchGateway = async <T>(
  config: GatewayClientConfig,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  } = {}
): Promise<GatewayResponse<T>> => {
  const url = new URL(path, config.baseUrl);
  const method = options.method ?? "GET";

  const fetchOptions: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
    signal: options.signal,
  };

  if (options.body !== undefined) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  // For HTTPS with self-signed certs (local dev), optionally disable validation
  if (url.protocol === "https:" && config.validateCerts === false) {
    // Node.js global agent modification for local dev only
    const agent = new https.Agent({ rejectUnauthorized: false });
    // @ts-expect-error - agent is not in RequestInit type but works in Node.js fetch
    fetchOptions.agent = agent;
  }

  try {
    const response = await fetch(url.toString(), fetchOptions);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = body;
      }

      throw {
        status: response.status,
        body: parsed,
      } satisfies GatewayErrorResponse;
    }

    const data = (await response.json()) as T;
    return {
      status: response.status,
      data,
    };
  } catch (error) {
    // If it's already a GatewayErrorResponse, rethrow
    if (typeof error === "object" && error !== null && "status" in error) {
      throw error;
    }

    // Network error or parse error
    throw {
      status: 0,
      body: error instanceof Error ? error.message : String(error),
    } satisfies GatewayErrorResponse;
  }
};

/** Check gateway reachability with a simple GET. */
export const checkGatewayHealth = async (
  config: GatewayClientConfig,
  signal?: AbortSignal
): Promise<boolean> => {
  try {
    // Try a simple definitions list as health check
    await fetchGateway(config, "/v1/definitions/", { signal });
    return true;
  } catch {
    return false;
  }
};
