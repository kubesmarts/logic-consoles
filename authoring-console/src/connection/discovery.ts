/**
 * Operator API discovery.
 *
 * Maps API presence/absence/403/unreachable to the InstallationState union.
 * Shows SEPARATE Kubernetes and gateway connection results.
 */
import type {
  KubernetesTransport,
  GatewayTransport,
  InstallationState,
  GroupVersionKind,
  LogicKind,
} from "../contracts/index.ts";
import { LogicKinds, LOGIC_GROUP, LOGIC_VERSION } from "../contracts/index.ts";

/** Expected operator kinds to check for installation. */
const EXPECTED_KINDS: LogicKind[] = [
  LogicKinds.ClusterLogicPlatform,
  LogicKinds.LogicFlowRuntime,
  LogicKinds.LogicFlowDefinition,
  LogicKinds.LogicFlowService,
];

/**
 * Discover operator installation by attempting to list each expected kind.
 * Maps API presence/absence/403/unreachable to InstallationState.
 */
export const discoverOperatorInstallation = async (
  transport: KubernetesTransport,
  signal?: AbortSignal
): Promise<InstallationState> => {
  const served: string[] = [];
  const missing: string[] = [];
  let forbidden = false;
  let unreachable = false;

  for (const kind of EXPECTED_KINDS) {
    const gvk: GroupVersionKind = {
      group: "logic.kubesmarts.org",
      version: "v1",
      kind,
    };

    try {
      // Attempt to list the kind (empty list is fine - we just check if API is served)
      await transport.list(gvk, { limit: 1 }, signal);
      served.push(kind);
    } catch (error) {
      // Check error type
      if (typeof error === "object" && error !== null) {
        const errorObj = error as { message?: string; status?: number };

        // 403 Forbidden
        if (errorObj.message?.includes("403") || errorObj.status === 403) {
          forbidden = true;
          break; // Stop checking if we hit 403
        }

        // 404 Not Found - API not served
        if (errorObj.message?.includes("404") || errorObj.status === 404) {
          missing.push(kind);
          continue;
        }

        // Network/connection errors
        if (
          errorObj.message?.includes("ECONNREFUSED") ||
          errorObj.message?.includes("ENOTFOUND") ||
          errorObj.message?.includes("unreachable")
        ) {
          unreachable = true;
          break;
        }
      }

      // Unknown error - treat as missing
      missing.push(kind);
    }
  }

  // Map results to InstallationState
  if (unreachable) {
    return { kind: "api-unreachable", detail: "Could not connect to Kubernetes API" };
  }

  if (forbidden) {
    return {
      kind: "forbidden-discovery",
      attempted: `${LOGIC_GROUP}/${LOGIC_VERSION}`,
    };
  }

  if (served.length === EXPECTED_KINDS.length) {
    return { kind: "installed", servedKinds: served };
  }

  if (served.length === 0) {
    return { kind: "missing-apis", missing: EXPECTED_KINDS };
  }

  return {
    kind: "partial-install",
    served,
    missing,
  };
};

/** Discovery result combining K8s and gateway states. */
export interface DiscoveryResult {
  readonly kubernetes: InstallationState;
  readonly gateway: {
    readonly reachable: boolean;
    readonly error?: string;
  };
}

/**
 * Perform full discovery: operator APIs + gateway reachability.
 * Returns separate results for Kubernetes and gateway.
 */
export const performDiscovery = async (
  kubernetesTransport: KubernetesTransport,
  gatewayTransport: GatewayTransport,
  signal?: AbortSignal
): Promise<DiscoveryResult> => {
  // Discover operator installation
  const kubernetes = await discoverOperatorInstallation(kubernetesTransport, signal);

  // Check gateway reachability (try to list definitions)
  let gatewayReachable = false;
  let gatewayError: string | undefined;

  try {
    await gatewayTransport.listDefinitions(signal);
    gatewayReachable = true;
  } catch (error) {
    gatewayError = error instanceof Error ? error.message : String(error);
  }

  return {
    kubernetes,
    gateway: {
      reachable: gatewayReachable,
      error: gatewayError,
    },
  };
};
