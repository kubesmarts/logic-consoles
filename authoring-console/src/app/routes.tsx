/**
 * Route table + the extension point packets B–H plug into.
 *
 * The shell owner (packet A) owns navigation and the core routes. Feature packets
 * contribute additional routes by passing `FeatureRoute[]` to the app rather than
 * editing this file, so the shell stays the single integrator of routes.
 */
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { WorkflowsPage } from "./pages/WorkflowsPage.tsx";
import { WorkflowVersionPage } from "./pages/WorkflowVersionPage.tsx";
import { TopologyPage } from "./pages/TopologyPage.tsx";
import { RuntimesPage } from "./pages/RuntimesPage.tsx";
import { PlatformPage } from "./pages/PlatformPage.tsx";
import { CompatibilityPage } from "./pages/CompatibilityPage.tsx";
import { SpikePage } from "../spike/SpikePage.tsx";

export interface FeatureRoute {
  readonly path: string;
  readonly element: ReactNode;
}

export const AppRoutes = ({ featureRoutes = [] }: { readonly featureRoutes?: readonly FeatureRoute[] }): ReactNode => (
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
);
