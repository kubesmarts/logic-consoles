/**
 * Loopback HTTP server for the Authoring Console launcher.
 *
 * Serves the built React bundle AND a same-origin JSON API on 127.0.0.1.
 * Validates Host/Origin on every request. Ties requests to session ID + selected context.
 */
import { of } from "@kubernetes/client-node/dist/gen/rxjsStub.js";
import { randomUUID } from "node:crypto";
import { RequestError, upstreamStatus } from "./api/errors.js";
import { createK8sClient, getClusterDisplay, listContexts } from "./kubernetes-client.js";
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { getRawAsset, isSea } from "node:sea";
import type { LauncherState } from "./types.js";
import {
  validateLoopbackRequest,
  extractSessionContext,
  validateSessionContext,
  type LoopbackOrigin,
} from "./security.js";
import type { K8sClientContext } from "./kubernetes-client.js";
import {
  handleGet,
  handleList,
  handleWrite,
  type GetRequest,
  type ListRequest,
  type WriteRequest,
} from "./api/kubernetes-handler.js";
import {
  handleGetTopology,
  handleListDefinitions,
  handleGetDefinition,
  handleListInstances,
  handleGetInstance,
  handleExecute,
  handleExecuteSync,
  handleInstanceAction,
} from "./api/gateway-handler.js";

/** Server configuration. */
export interface ServerConfig {
  readonly port: number;
  readonly distPath: string;
  serveDevelopmentAssets?: http.RequestListener;
}

/** Parse URL path and query. */
const parseUrl = (url: string): { pathname: string; searchParams: URLSearchParams } => {
  const urlObj = new URL(url, "http://localhost");
  return {
    pathname: urlObj.pathname,
    searchParams: urlObj.searchParams,
  };
};

/** Read request body as JSON. */
const readBody = async (req: http.IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 4 * 1024 * 1024) throw new RequestError(413, "Request too large");
    chunks.push(buffer);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new RequestError(400, "Invalid JSON request"); }
};

/** Send JSON response. */
const sendJson = (res: http.ServerResponse, status: number, data: unknown): void => {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
};

/** Send error response. */
const sendError = (res: http.ServerResponse, status: number, message: string): void => {
  sendJson(res, status, { error: message, message, status });
};

/** Create HTTP server. */
export const createServer = (
  config: ServerConfig,
  state: LauncherState,
  k8sClient: K8sClientContext
): http.Server => {
  const origin: LoopbackOrigin = {
    scheme: "http",
    host: "127.0.0.1",
    port: config.port,
  };

  const server = http.createServer(async (req, res) => {
    // Validate loopback request FIRST (fail-closed, even for OPTIONS)
    const expectedOrigin = config.port === 0 ? { ...origin, port: req.socket.localPort! } : origin;
    if (!validateLoopbackRequest(req, expectedOrigin)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    // Add CORS headers for same-origin API calls (after validation)
    res.setHeader("Access-Control-Allow-Origin", `http://127.0.0.1:${expectedOrigin.port}`);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-Id, X-Context-Name");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    // Handle OPTIONS preflight (after loopback validation)
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    let pathname;
    try { pathname = parseUrl(req.url ?? "/").pathname; }
    catch { sendError(res, 400, "Invalid request URL"); return; }

    if (pathname.startsWith("/api/")) {
      try {
        // Read the complete body before validating identity. A context change while
        // the request is uploading must invalidate it before any write is dispatched.
        const body = req.method === "POST" ? await readBody(req) : {};
        const bootstrap = req.method === "GET" && ["/api/session", "/api/contexts"].includes(pathname);
        if (!bootstrap) {
          const key = extractSessionContext(req);
          if (!key || !state.context) { sendError(res, 401, "Missing session or context"); return; }
          if (!validateSessionContext(key, { sessionId: state.session.sessionId, contextName: state.context.contextName })) {
            sendJson(res, 409, { status: 409, kind: "session-changed", message: "Session or context changed" });
            return;
          }
        }
        if (req.method === "POST" && (pathname === "/api/connect" || pathname === "/api/disconnect")) {
          const next = body as { contextName?: string; gatewayUrl?: string | null };
          if (pathname === "/api/connect") {
            const name = next.contextName;
            if (!name || !listContexts().some(ctx => ctx.name === name)) throw new RequestError(400, "Unknown kubeconfig context");
            const epoch = state.session.sessionId;
            const client = createK8sClient(name);
            const gateway = configuredGateway(next.gatewayUrl) ?? await discoverGateway(client);
            if (state.session.sessionId !== epoch) {
              sendJson(res, 409, { status: 409, kind: "session-changed", message: "Session or context changed" });
              return;
            }
            k8sClient = client;
            state.context = { contextName: name, clusterDisplay: getClusterDisplay(client.kc), selectedAt: new Date() };
            state.gateway = gateway;
          } else {
            state.gateway = null;
          }
          state.session = { sessionId: randomUUID(), startedAt: new Date() };
          sendJson(res, 200, sessionInfo(state));
          return;
        }
        // A platform may have been installed or become ready after Connect.
        if (!state.gateway && pathname.startsWith("/api/gateway/")) {
          const epoch = state.session.sessionId;
          const gateway = await discoverGateway(k8sClient);
          if (state.session.sessionId !== epoch) {
            sendJson(res, 409, { status: 409, kind: "session-changed", message: "Session or context changed" });
            return;
          }
          state.gateway ??= gateway;
        }
        await handleApiRequest(req, res, pathname, state, k8sClient, body);
      } catch (error) {
        const status = upstreamStatus(error);
        if (error && typeof error === "object" && ("writeError" in error || "kind" in error)) {
          sendJson(res, status, error);
        } else {
          sendError(res, status, error instanceof RequestError ? error.message : `API request failed (HTTP ${status})`);
        }
      }
      return;
    }

    // Only the browser bundle is public.
    if (pathname.startsWith("/launcher/") || !["GET", "HEAD"].includes(req.method ?? "")) {
      sendError(res, 404, "Not found");
      return;
    }
    if (config.serveDevelopmentAssets) config.serveDevelopmentAssets(req, res);
    else await serveStatic(req, res, pathname, config.distPath);
  });

  return server;
};

function sessionInfo(state: LauncherState) {
  return {
    sessionId: state.session.sessionId, mode: "launcher", namespace: null,
    context: state.context && { contextName: state.context.contextName, clusterDisplay: state.context.clusterDisplay },
    gatewayUrl: state.gateway?.baseUrl ?? null,
  };
}

function configuredGateway(value?: string | null) {
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch { throw new RequestError(400, "Invalid gateway origin"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new RequestError(400, "Enter an HTTP or HTTPS gateway origin");
  }
  return { baseUrl: url.origin, discoveredAt: new Date() };
}

/** Platform status reports the external address for both Route and Ingress. */
async function discoverGateway(client: K8sClientContext) {
  try {
    const response = await client.customApi.listClusterCustomObject({
      group: "logic.kubesmarts.org", version: "v1", plural: "clusterlogicplatforms", limit: 1,
    }, {
      middlewareMergeStrategy: "append",
      middleware: [{
        pre: request => { request.setSignal(AbortSignal.timeout(4_000)); return of(request); },
        post: response => of(response),
      }],
    }) as { items: { status?: { gateway?: { url?: string } } }[] };
    return configuredGateway(response.items[0]?.status?.gateway?.url);
  } catch {
    // A missing platform or lack of platform list permission still allows connecting.
    return null;
  }
}

/** Handle API requests. */
const handleApiRequest = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  state: LauncherState,
  k8sClient: K8sClientContext,
  requestBody: unknown
): Promise<void> => {
  // Session info
  if (pathname === "/api/session" && req.method === "GET") {
    sendJson(res, 200, sessionInfo(state));
    return;
  }

  // List contexts
  if (pathname === "/api/contexts" && req.method === "GET") {
    const contexts = listContexts();
    sendJson(res, 200, contexts);
    return;
  }

  if (pathname === "/api/discovery" && req.method === "GET") {
    sendJson(res, 200, await k8sClient.customApi.getAPIResources({ group: "logic.kubesmarts.org", version: "v1" }));
    return;
  }

  // Kubernetes API
  if (pathname === "/api/k8s/get" && req.method === "POST") {
    const body = requestBody as GetRequest;
    const result = await handleGet(k8sClient, body);
    sendJson(res, 200, result);
    return;
  }

  if (pathname === "/api/k8s/list" && req.method === "POST") {
    const body = requestBody as ListRequest;
    const result = await handleList(k8sClient, body);
    sendJson(res, 200, result);
    return;
  }

  if (pathname === "/api/k8s/write" && req.method === "POST") {
    const body = requestBody as WriteRequest;
    const result = await handleWrite(k8sClient, body);
    sendJson(res, 200, result);
    return;
  }

  // Gateway API
  if (pathname === "/api/gateway/topology" && req.method === "GET") {
    if (!state.gateway) {
      sendError(res, 503, "Gateway not configured");
      return;
    }
    const { searchParams } = parseUrl(req.url ?? "");
    const namespace = searchParams.get("namespace");
    if (!namespace) {
      sendError(res, 400, "Missing namespace parameter");
      return;
    }
    const result = await handleGetTopology(state.gateway, namespace);
    sendJson(res, 200, result);
    return;
  }

  if (pathname === "/api/gateway/definitions" && req.method === "GET") {
    if (!state.gateway) {
      sendError(res, 503, "Gateway not configured");
      return;
    }
    const result = await handleListDefinitions(state.gateway);
    sendJson(res, 200, result);
    return;
  }

  if (pathname.startsWith("/api/gateway/definition/") && req.method === "GET") {
    if (!state.gateway) {
      sendError(res, 503, "Gateway not configured");
      return;
    }
    const parts = pathname.split("/").slice(4); // Skip /api/gateway/definition/
    if (parts.length !== 3) {
      sendError(res, 400, "Invalid definition path");
      return;
    }
    const [namespace, name, version] = parts.map(decodeURIComponent);
    const result = await handleGetDefinition(state.gateway, namespace, name, version);
    sendJson(res, 200, result);
    return;
  }

  if (pathname === "/api/gateway/instances" && req.method === "GET") {
    if (!state.gateway) {
      sendError(res, 503, "Gateway not configured");
      return;
    }
    const { searchParams } = parseUrl(req.url ?? "");
    const filters = {
      namespace: searchParams.get("namespace") ?? undefined,
      name: searchParams.get("name") ?? undefined,
      version: searchParams.get("version") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    };
    const result = await handleListInstances(state.gateway, filters);
    sendJson(res, 200, result);
    return;
  }

  if (pathname.startsWith("/api/gateway/instance/") && req.method === "GET") {
    if (!state.gateway) {
      sendError(res, 503, "Gateway not configured");
      return;
    }
    const id = pathname.split("/").pop();
    if (!id) {
      sendError(res, 400, "Missing instance ID");
      return;
    }
    const result = await handleGetInstance(state.gateway, decodeURIComponent(id));
    sendJson(res, 200, result);
    return;
  }

  if (pathname === "/api/gateway/execute" && req.method === "POST") {
    if (!state.gateway) {
      sendError(res, 503, "Gateway not configured");
      return;
    }
    const body = requestBody as { href: string; input: unknown };
    const result = await handleExecute(state.gateway, body.href, body.input);
    sendJson(res, 200, result);
    return;
  }

  if (pathname === "/api/gateway/execute-sync" && req.method === "POST") {
    if (!state.gateway) {
      sendError(res, 503, "Gateway not configured");
      return;
    }
    const body = requestBody as { href: string; input: unknown };
    const result = await handleExecuteSync(state.gateway, body.href, body.input);
    sendJson(res, 200, result);
    return;
  }

  if (pathname === "/api/gateway/instance-action" && req.method === "POST") {
    if (!state.gateway) {
      sendError(res, 503, "Gateway not configured");
      return;
    }
    const body = requestBody as { linkHref: string; instanceId: string };
    const result = await handleInstanceAction(state.gateway, body.linkHref, body.instanceId);
    sendJson(res, 200, result);
    return;
  }

  sendError(res, 404, "Not found");
};

/** Read a bundle file from disk, or from the assets embedded in a single executable. */
const readBundleFile = async (pathname: string, distPath: string): Promise<{ filePath: string; content: Buffer }> => {
  if (isSea()) {
    // Embedded asset keys are paths relative to dist/, such as "index.html" or "assets/app.js".
    const key = path.posix.normalize(pathname).replace(/^\/+/, "");
    const filePath = key === "" || key.endsWith("/") ? `${key}index.html` : key;
    return { filePath, content: Buffer.from(getRawAsset(filePath)) };
  }
  let filePath = path.join(distPath, pathname === "/" ? "index.html" : pathname);
  const stats = await fs.promises.stat(filePath);
  if (stats.isDirectory()) filePath = path.join(filePath, "index.html");
  return { filePath, content: await fs.promises.readFile(filePath) };
};

/** Serve static files from dist. */
const serveStatic = async (
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  distPath: string
): Promise<void> => {
  try {
    const { filePath, content } = await readBundleFile(pathname, distPath);

    // Determine content type
    const ext = path.extname(filePath);
    const contentTypeMap: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".woff2": "font/woff2",
      ".woff": "font/woff",
      ".ttf": "font/ttf",
      ".wasm": "application/wasm",
    };
    const contentType = contentTypeMap[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
};
