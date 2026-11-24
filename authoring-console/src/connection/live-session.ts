import type { AppServices } from "../app/App.tsx";
import { createConsoleStorage } from "../app/storage.ts";
import {
  LOGIC_GROUP_VERSION,
  LogicKinds,
  sessionScopeOf,
  type InstallationState,
  type SessionIdentity,
} from "../contracts/index.ts";
import { devBaselineCompatibilityManifest } from "../compatibility/manifest.ts";
import { createCapabilityTransport } from "./capability-transport.ts";
import {
  createDirectBrowserAdapter,
  type DirectBrowserConfig,
} from "./direct-browser-adapter.ts";
import { createLauncherAdapter } from "./launcher-adapter.ts";

export interface LauncherSession extends SessionIdentity {
  readonly mode: "launcher";
  readonly gatewayUrl: string | null;
}

export interface ConnectedSession {
  readonly close?: () => void;
  readonly services: AppServices;
  readonly installation: InstallationState;
  readonly gatewayStatus: string;
  readonly launcher?: LauncherSession;
}

export async function findLauncher(
  hostname: string,
  signal?: AbortSignal,
): Promise<LauncherSession | null> {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) return null;
  const response = await fetch("/api/session", { cache: "no-store", signal });
  if (
    response.status === 404 ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    return null;
  const session = await response.json();
  if (
    !response.ok ||
    session.mode !== "launcher" ||
    !session.sessionId ||
    !session.context?.contextName
  ) {
    throw new Error("Unable to read the local launcher session.");
  }
  return session as LauncherSession;
}

export function launcherHeaders(session: SessionIdentity) {
  return {
    "Content-Type": "application/json",
    "X-Session-Id": session.sessionId,
    "X-Context-Name": session.context.contextName,
  };
}

function endpoint(value: string, allowHttp: boolean): string {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.hash ||
    url.search ||
    !(url.protocol === "https:" || (allowHttp && url.protocol === "http:"))
  ) {
    throw new Error(
      allowHttp
        ? "Enter the gateway HTTP or HTTPS origin."
        : "Enter the Kubernetes HTTPS origin.",
    );
  }
  return url.origin;
}

async function inspectApi(response: Response): Promise<InstallationState> {
  const kinds = Object.values(LogicKinds);
  if (response.status === 403)
    return { kind: "forbidden-discovery", attempted: LOGIC_GROUP_VERSION };
  if (response.status === 404) return { kind: "missing-apis", missing: kinds };
  if (!response.ok)
    throw new Error(`Kubernetes API returned HTTP ${response.status}.`);
  const { resources } = await response.json();
  if (!Array.isArray(resources))
    throw new Error(
      "The Kubernetes endpoint returned an invalid discovery document.",
    );
  const served = kinds.filter((kind) =>
    resources.some(
      (resource) =>
        resource.kind === kind && !String(resource.name).includes("/"),
    ),
  );
  const missing = kinds.filter((kind) => !served.includes(kind));
  if (missing.length === 0) return { kind: "installed", servedKinds: served };
  return served.length
    ? { kind: "partial-install", served, missing }
    : { kind: "missing-apis", missing };
}

async function finishConnection(
  session: SessionIdentity,
  transport: ReturnType<typeof createLauncherAdapter>,
  discovery: Response,
  gatewayUrl: string,
): Promise<ConnectedSession> {
  const installation = await inspectApi(discovery);
  let gatewayStatus = "No gateway configured";
  if (gatewayUrl) {
    try {
      await transport.listDefinitions(AbortSignal.timeout(10000));
      gatewayStatus = `Connected to ${gatewayUrl}`;
    } catch {
      gatewayStatus = `Unable to reach ${gatewayUrl}. Kubernetes actions remain available.`;
    }
  }
  return {
    installation,
    gatewayStatus,
    services: {
      session,
      gateway: transport,
      kubernetes: transport,
      capabilities: createCapabilityTransport(transport),
      storage: createConsoleStorage(),
      compatibility: devBaselineCompatibilityManifest,
    },
  };
}

export async function connectDirect(
  config: DirectBrowserConfig,
  namespace: string,
): Promise<ConnectedSession> {
  const k8sApiUrl = endpoint(config.k8sApiUrl.trim(), false);
  const gatewayUrl = config.gatewayUrl.trim()
    ? endpoint(config.gatewayUrl.trim(), true)
    : "";
  const controller = new AbortController();
  const transport = createDirectBrowserAdapter(
    {
      ...config,
      k8sApiUrl,
      gatewayUrl,
    },
    controller.signal,
  );
  const response = await fetch(`${k8sApiUrl}/apis/${LOGIC_GROUP_VERSION}`, {
    headers: { Authorization: `Bearer ${config.token}` },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  const session: SessionIdentity = {
    sessionId: crypto.randomUUID(),
    mode: "direct-browser",
    namespace,
    context: {
      contextName: new URL(k8sApiUrl).host,
      clusterDisplay: k8sApiUrl,
    },
  };
  return {
    ...(await finishConnection(session, transport, response, gatewayUrl)),
    close: () => controller.abort(),
  };
}

export async function connectLauncher(
  previous: LauncherSession,
  contextName: string,
  namespace: string,
  address: string,
): Promise<ConnectedSession> {
  const gatewayUrl = address.trim() ? endpoint(address.trim(), true) : "";
  const response = await fetch("/api/connect", {
    method: "POST",
    headers: launcherHeaders(previous),
    body: JSON.stringify({ contextName, gatewayUrl: gatewayUrl || null }),
  });
  if (!response.ok)
    throw new Error(`Launcher connection failed (HTTP ${response.status}).`);
  const launcher: LauncherSession = await response.json();
  const session = { ...launcher, namespace };
  const transport = createLauncherAdapter({
    baseUrl: "",
    getSessionKey: () => sessionScopeOf(session),
  });
  const discovery = await fetch("/api/discovery", {
    headers: launcherHeaders(session),
    signal: AbortSignal.timeout(10000),
  });
  return {
    ...(await finishConnection(
      session,
      transport,
      discovery,
      launcher.gatewayUrl ?? gatewayUrl,
    )),
    launcher,
  };
}

export function installationText(state: InstallationState): string {
  switch (state.kind) {
    case "installed":
      return `Kubernetes serves all ${state.servedKinds.length} Logic Operator APIs.`;
    case "partial-install":
      return `Missing operator APIs: ${state.missing.join(", ")}.`;
    case "missing-apis":
      return "The Logic Operator APIs are missing.";
    case "forbidden-discovery":
      return `Access to discover ${state.attempted} was denied. You can continue with your available permissions.`;
    case "operator-unhealthy":
      return "The operator reports an unhealthy controller.";
    case "api-unreachable":
      return "The Kubernetes API is unreachable.";
  }
}
