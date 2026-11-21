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
import { createServer } from "./server.js";
import { createK8sClient, getCurrentContextName, getClusterDisplay } from "./kubernetes-client.js";
import type { LauncherState } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Default configuration. */
const DEFAULT_PORT = 8080;

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

  console.log(`Session ID: ${state.session.sessionId}\n`);

  // Server configuration
  const port = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
  const distPath = path.resolve(__dirname, "../../dist");

  const config = {
    port,
    distPath,
  };

  // Create and start server
  const server = createServer(config, state, k8sClient);

  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`Server running at ${url}`);
    console.log(`\nOpening browser...`);
    console.log(`If the browser doesn't open, navigate to: ${url}\n`);
    console.log("Press Ctrl+C to stop the launcher.\n");

    // Open browser after a short delay
    setTimeout(() => openBrowser(url), 500);
  });

  // Handle graceful shutdown
  const shutdown = (): void => {
    console.log("\nShutting down launcher...");
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
