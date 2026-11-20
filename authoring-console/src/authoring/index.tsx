/**
 * Authoring workspace — E1 + E2 public API.
 *
 * Exports:
 * - `authoringRoutes`: FeatureRoute[] for the shell to integrate (via AppRoutes).
 * - `AuthoringProvider`: React Context provider that wraps authoring routes.
 * - `useAuthoringContext`: the hand-off hook E2 imports to obtain the current
 *   portable document + parsed identity for publishing.
 *
 * E1 owns the authoring workspace and draft management. E2 owns runtime selection,
 * CR-name generation, version suggestion, and the publish action.
 */
import { lazy } from "react";
import type { ReactNode } from "react";
import type { FeatureRoute } from "../app/routes.tsx";
import { AuthoringProvider } from "./AuthoringProvider.tsx";

/**
 * Lazy-load the authoring workspace so Monaco + CNCF diagram stay out of the main
 * bundle (they load only when the authoring route is opened).
 */
const AuthoringWorkspace = lazy(() =>
  import("./AuthoringWorkspace.tsx").then((m) => ({ default: m.AuthoringWorkspace })),
);

/**
 * Lazy-load the publish wizard (E2).
 */
const PublishWizard = lazy(() =>
  import("./publish/PublishWizard.tsx").then((m) => ({ default: m.PublishWizard })),
);

/**
 * Wrapper that provides authoring context for routes.
 */
const AuthoringWorkspaceWithProvider = (): ReactNode => (
  <AuthoringProvider>
    <AuthoringWorkspace />
  </AuthoringProvider>
);

/**
 * Wrapper that provides authoring context for the publish wizard.
 */
const PublishWizardWithProvider = (): ReactNode => (
  <AuthoringProvider>
    <PublishWizard />
  </AuthoringProvider>
);

/**
 * E1 + E2 feature routes. The shell integrates these via `AppRoutes({ featureRoutes })`.
 * - /authoring → blank workspace
 * - /authoring/:draftId → resume a saved draft
 * - /publish → publish wizard (E2)
 */
export const authoringRoutes: readonly FeatureRoute[] = [
  { path: "/authoring", element: <AuthoringWorkspaceWithProvider /> },
  { path: "/authoring/:draftId", element: <AuthoringWorkspaceWithProvider /> },
  { path: "/publish", element: <PublishWizardWithProvider /> },
];

// Re-export the provider and hook for E2 integration
export { AuthoringProvider, useAuthoringContext } from "./AuthoringProvider.tsx";
export type { AuthoringContextValue, ParsedWorkflowIdentity } from "./types.ts";
export { INPUT_SCHEMA_SNIPPET } from "./types.ts";
