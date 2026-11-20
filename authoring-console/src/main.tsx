/**
 * Browser entry point. Wires fixture-backed services (this task has no live
 * connection), starts the MSW worker so gateway calls resolve against fixtures, and
 * mounts the app under a HashRouter (so the static/launcher build needs no server
 * rewrite rules).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "@patternfly/react-core/dist/styles/base.css";
import { App } from "./app/App.tsx";
import type { ConsoleServices } from "./app/ConsoleContext.tsx";
import { createConsoleStorage } from "./app/storage.ts";
import { createFetchGatewayTransport } from "./fixtures/gateway-transport.ts";
import { createFixtureKubernetesTransport } from "./fixtures/transports/kubernetes.ts";
import { createFixtureCapabilityTransport } from "./fixtures/transports/capabilities.ts";
import { launcherSession } from "./fixtures/sessions.ts";
import { devBaselineCompatibilityManifest } from "./fixtures/compatibility-baseline.ts";

const services: ConsoleServices = {
  session: launcherSession,
  gateway: createFetchGatewayTransport(),
  kubernetes: createFixtureKubernetesTransport(),
  capabilities: createFixtureCapabilityTransport("cluster-admin"),
  storage: createConsoleStorage(),
  compatibility: devBaselineCompatibilityManifest,
};

const bootstrap = async (): Promise<void> => {
  const { mockWorker } = await import("./fixtures/msw/browser.ts");
  await mockWorker.start({ onUnhandledFrame: "bypass" });

  const container = document.getElementById("root");
  if (!container) throw new Error("Missing #root element");
  createRoot(container).render(
    <StrictMode>
      <HashRouter>
        <App services={services} />
      </HashRouter>
    </StrictMode>,
  );
};

void bootstrap();
