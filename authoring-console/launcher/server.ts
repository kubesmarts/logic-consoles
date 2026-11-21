/**
 * Loopback HTTP server for the Authoring Console launcher.
 *
 * Serves the built React bundle AND a same-origin JSON API on 127.0.0.1.
 * Validates Host/Origin on every request. Ties requests to session ID + selected context.
 */
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import type { LauncherState, SessionContextKey } from "./types.js";
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
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf-8");
        resolve(body ? JSON.parse(body) : null);
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
};

/** Send JSON response. */
const sendJson = (res: http.ServerResponse, status: number, data: unknown): void => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

/** Send error response. */
const sendError = (res: http.ServerResponse, status: number, message: string): void => {
  sendJson(res, status, { error: message });
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
    // Add CORS headers for same-origin API calls
    res.setHeader("Access-Control-Allow-Origin", `http://127.0.0.1:${config.port}`);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-Id, X-Context-Name");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    // Handle OPTIONS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Validate loopback request (Host + Origin)
    if (!validateLoopbackRequest(req, origin)) {
      sendError(res, 403, "Invalid Host or Origin header");
      return;
    }

    const { pathname } = parseUrl(req.url ?? "/");

    // API routes
    if (pathname.startsWith("/api/")) {
      // Extract and validate session+context (except for /api/session and /api/contexts)
      if (!pathname.startsWith("/api/session") && !pathname.startsWith("/api/contexts")) {
        const sessionContext = extractSessionContext(req);
        if (!sessionContext) {
          sendError(res, 401, "Missing session or context headers");
          return;
        }

        if (!state.context) {
          sendError(res, 400, "No context selected");
          return;
        }

        const activeKey: SessionContextKey = {
          sessionId: state.session.sessionId,
          contextName: state.context.contextName,
        };

        if (!validateSessionContext(sessionContext, activeKey)) {
          sendError(res, 409, "Session or context mismatch - request invalidated");
          return;
        }
      }

      try {
        await handleApiRequest(req, res, pathname, state, k8sClient);
      } catch (error) {
        console.error("API error:", error);
        sendError(res, 500, error instanceof Error ? error.message : "Internal server error");
      }
      return;
    }

    // Serve static files
    await serveStatic(req, res, pathname, config.distPath);
  });

  return server;
};

/** Handle API requests. */
const handleApiRequest = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  state: LauncherState,
  k8sClient: K8sClientContext
): Promise<void> => {
  // Session info
  if (pathname === "/api/session" && req.method === "GET") {
    sendJson(res, 200, {
      sessionId: state.session.sessionId,
      mode: "launcher",
      context: state.context
        ? {
            contextName: state.context.contextName,
            clusterDisplay: state.context.clusterDisplay,
          }
        : null,
      namespace: null, // Set by browser based on user selection
    });
    return;
  }

  // List contexts
  if (pathname === "/api/contexts" && req.method === "GET") {
    const { listContexts } = await import("./kubernetes-client.js");
    const contexts = listContexts();
    sendJson(res, 200, contexts);
    return;
  }

  // Kubernetes API
  if (pathname === "/api/k8s/get" && req.method === "POST") {
    const body = (await readBody(req)) as GetRequest;
    const result = await handleGet(k8sClient, body);
    sendJson(res, 200, result);
    return;
  }

  if (pathname === "/api/k8s/list" && req.method === "POST") {
    const body = (await readBody(req)) as ListRequest;
    const result = await handleList(k8sClient, body);
    sendJson(res, 200, result);
    return;
  }

  if (pathname === "/api/k8s/write" && req.method === "POST") {
    const body = (await readBody(req)) as WriteRequest;
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
    const [namespace, name, version] = parts;
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
    const result = await handleGetInstance(state.gateway, id);
    sendJson(res, 200, result);
    return;
  }

  if (pathname === "/api/gateway/execute" && req.method === "POST") {
    if (!state.gateway) {
      sendError(res, 503, "Gateway not configured");
      return;
    }
    const body = (await readBody(req)) as { href: string; input: unknown };
    const result = await handleExecute(state.gateway, body.href, body.input);
    sendJson(res, 200, result);
    return;
  }

  if (pathname === "/api/gateway/execute-sync" && req.method === "POST") {
    if (!state.gateway) {
      sendError(res, 503, "Gateway not configured");
      return;
    }
    const body = (await readBody(req)) as { href: string; input: unknown };
    const result = await handleExecuteSync(state.gateway, body.href, body.input);
    sendJson(res, 200, result);
    return;
  }

  if (pathname === "/api/gateway/instance-action" && req.method === "POST") {
    if (!state.gateway) {
      sendError(res, 503, "Gateway not configured");
      return;
    }
    const body = (await readBody(req)) as { linkHref: string; instanceId: string };
    const result = await handleInstanceAction(state.gateway, body.linkHref, body.instanceId);
    sendJson(res, 200, result);
    return;
  }

  sendError(res, 404, "Not found");
};

/** Serve static files from dist. */
const serveStatic = async (
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  distPath: string
): Promise<void> => {
  // Map URL path to file path
  let filePath = path.join(distPath, pathname === "/" ? "index.html" : pathname);

  // Check if file exists
  try {
    const stats = await fs.promises.stat(filePath);

    if (stats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

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
    };
    const contentType = contentTypeMap[ext] || "application/octet-stream";

    const content = await fs.promises.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    // File not found - serve index.html for SPA routing
    try {
      const indexPath = path.join(distPath, "index.html");
      const content = await fs.promises.readFile(indexPath);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  }
};
