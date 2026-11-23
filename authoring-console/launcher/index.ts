#!/usr/bin/env node
/**
 * Authoring Console launcher entry point.
 *
 * Starts the loopback HTTP server, serves the React bundle, and opens the default browser.
 * Uses the selected kubeconfig context for Kubernetes requests.
 */
import * as crypto from "node:crypto";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import { rememberPort, selectedPort } from "./port.js";
import { createServer, type ServerConfig } from "./server.js";
import { createK8sClient, getCurrentContextName, getClusterDisplay } from "./kubernetes-client.js";
import type { LauncherState } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Generate a random session ID. */
const generateSessionId = (): string => {
  return crypto.randomBytes(16).toString("hex");
};

/** Open URL in default browser (cross-platform). */
const openBrowser = (url: string): void => {
  const platform = process.platform;
  const command =
    platform === "darwin"
      ? `open "${url}"`
      : platform === "win32"
        ? `start "${url}"`
        : `xdg-open "${url}"`;

  exec(command, (error) => {
    if (error) {
      console.error(`Failed to open browser: ${error.message}`);
      console.log(`Please open manually: ${url}`);
    }
  });
};

/** Main launcher function. */
const main = async (): Promise<void> => {
  console.log("Authoring Console Launcher");
  console.log("==========================\n");

  // Get current context
  const contextName = getCurrentContextName();
  if (!contextName) {
    console.error("Error: No Kubernetes context is currently selected");
    console.error("Please configure your kubeconfig with `kubectl config use-context <context-name>`");
    process.exit(1);
  }

  console.log(`Using kubeconfig context: ${contextName}`);

  // Create K8s client
  let k8sClient;
  try {
    k8sClient = createK8sClient(contextName);
  } catch (error) {
    console.error(`Error loading kubeconfig: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const clusterDisplay = getClusterDisplay(k8sClient.kc);
  console.log(`Cluster: ${clusterDisplay}`);

  // Initialize launcher state
  const state: LauncherState = {
    session: {
      sessionId: generateSessionId(),
      startedAt: new Date(),
    },
    context: {
      contextName,
      clusterDisplay,
      selectedAt: new Date(),
    },
    gateway: null, // Will be set when user discovers/enters gateway URL
  };

  const args = process.argv.slice(2);
  const development = args[0] === "--dev";
  const { port, remember } = await selectedPort(development ? args.slice(1) : args);
  const distPath = path.resolve(__dirname, "../../dist");

  const config: ServerConfig = {
    port,
    distPath,
  };

  // Create and start server
  const server = createServer(config, state, k8sClient);

  const vite = development ? await (await import("vite")).createServer({
    server: { middlewareMode: true, hmr: { server }, cors: false },
    appType: "spa",
  }) : undefined;
  if (vite) config.serveDevelopmentAssets = vite.middlewares;

  server.on("error", (error: NodeJS.ErrnoException) => {
    console.error(error.code === "EADDRINUSE"
      ? `Port ${port} is in use. Release it and retry, or run npm start -- --port PORT. Saved drafts belong to their original address.`
      : `Launcher failed to listen on 127.0.0.1:${port} (${error.code ?? "network error"})`);
    void vite?.close();
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => {
    if (remember) void rememberPort(port).catch(() => console.warn("Could not save the port preference."));
    const url = `http://127.0.0.1:${port}`;
    console.log(`Server running at ${url}`);
    console.log(`\nOpening browser...`);
    console.log(`If the browser doesn't open, navigate to: ${url}\n`);
    console.log("Press Ctrl+C to stop the launcher.\n");

    // Open browser after a short delay
    if (!process.env.NO_OPEN) setTimeout(() => openBrowser(url), 500);
  });

  // Handle graceful shutdown
  const shutdown = (): void => {
    console.log("\nShutting down launcher...");
    void vite?.close();
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
