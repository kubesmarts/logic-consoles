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
 * Validate and constrain a browser-supplied href to the configured gateway.
 *
 * CRITICAL SECURITY: Browser-supplied hrefs are UNTRUSTED. An absolute href in
 * `new URL(path, baseUrl)` can override baseUrl and cause SSRF to arbitrary hosts
 * (cloud metadata, internal services). This function ensures we forward ONLY to
 * the SELECTED gateway destination.
 *
 * The gateway's advertised `_links` hrefs are relative (`/v1/runtime/...`).
 * Reject any absolute URL or href that could bypass the gateway origin.
 *
 * NOTE: Template placeholders like {id} should be substituted BEFORE validation.
 * This function expects a concrete, template-free path.
 *
 * @param href - Untrusted href from browser (from definition._links), should be concrete (no template placeholders)
 * @param config - Gateway configuration with trusted baseUrl
 * @returns Validated relative path (pathname + search only)
 * @throws Error if href is absolute or would bypass the gateway origin
 */
export const validateGatewayHref = (href: string, config: GatewayClientConfig): string => {
  // Reject hrefs with backslashes (Windows path confusion, normalizer bypasses)
  if (href.includes("\\")) {
    throw new Error(`Rejected href with backslash: ${href}`);
  }

  // Reject hrefs with leading/embedded whitespace or control characters
  // eslint-disable-next-line no-control-regex
  if (href !== href.trim() || /[\x00-\x1F\x7F]/.test(href)) {
    throw new Error(`Rejected href with whitespace or control characters`);
  }

  // Reject absolute URLs with schemes (http:, https:, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) {
    throw new Error(`Rejected absolute href with scheme: ${href}`);
  }

  // Reject hrefs with authority markers (//host/path)
  if (href.includes("//")) {
    throw new Error(`Rejected href with authority marker: ${href}`);
  }

  // Only allow hrefs starting with /
  if (!href.startsWith("/")) {
    throw new Error(`Rejected non-root-relative href: ${href}`);
  }

  // Resolve against baseUrl and verify origin constraint (defense in depth)
  const gatewayUrl = new URL(config.baseUrl);
  const resolvedUrl = new URL(href, config.baseUrl);

  // Confirm resolved URL's origin matches the configured gateway origin
  if (resolvedUrl.origin !== gatewayUrl.origin) {
    throw new Error(
      `Rejected href: resolved origin ${resolvedUrl.origin} does not match gateway origin ${gatewayUrl.origin}`
    );
  }

  // Return only pathname + search (no origin, no fragment)
  return resolvedUrl.pathname + resolvedUrl.search;
};

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
