/**
 * Route table + the extension point packets B–H plug into.
 *
 * The shell owner (packet A) owns navigation and the core routes. Feature packets
 * contribute additional routes by passing `FeatureRoute[]` to the app rather than
 * editing this file, so the shell stays the single integrator of routes.
 */
import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Bullseye, Spinner } from "@patternfly/react-core";
import { WorkflowsPage } from "./pages/WorkflowsPage.tsx";
import { TopologyPage } from "./pages/TopologyPage.tsx";
import { RuntimesPage } from "./pages/RuntimesPage.tsx";
import { PlatformPage } from "./pages/PlatformPage.tsx";
import { CompatibilityPage } from "./pages/CompatibilityPage.tsx";

// Editor-heavy routes are lazy so Monaco and the CNCF diagram editor stay out of the
// main bundle (they load only when their route is opened). The /spike proof remains
// reachable in dev/test and in the production preview, just in its own chunk.
const WorkflowVersionPage = lazy(() =>
  import("./pages/WorkflowVersionPage.tsx").then((m) => ({ default: m.WorkflowVersionPage })),
);
const SpikePage = lazy(() => import("../spike/SpikePage.tsx").then((m) => ({ default: m.SpikePage })));

export interface FeatureRoute {
  readonly path: string;
  readonly element: ReactNode;
}

const routeFallback = (
  <Bullseye>
    <Spinner aria-label="Loading view" />
  </Bullseye>
);

export const AppRoutes = ({ featureRoutes = [] }: { readonly featureRoutes?: readonly FeatureRoute[] }): ReactNode => (
  <Suspense fallback={routeFallback}>
    <Routes>
      <Route path="/" element={<Navigate to="/workflows" replace />} />
      <Route path="/workflows" element={<WorkflowsPage />} />
      <Route path="/workflows/:namespace/:workflowName/:version" element={<WorkflowVersionPage />} />
      <Route path="/topology" element={<TopologyPage />} />
      <Route path="/runtimes" element={<RuntimesPage />} />
      <Route path="/platform" element={<PlatformPage />} />
      <Route path="/compatibility" element={<CompatibilityPage />} />
      <Route path="/spike" element={<SpikePage />} />
      {featureRoutes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}
    </Routes>
  </Suspense>
);
