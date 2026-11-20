/**
 * Authoring workspace — E1 public API.
 *
 * Exports:
 * - `authoringRoutes`: FeatureRoute[] for the shell to integrate (via AppRoutes).
 * - `useAuthoringContext`: the hand-off hook E2 imports to obtain the current
 *   portable document + parsed identity for publishing.
 *
 * E1 owns the authoring workspace and draft management. E2 owns runtime selection,
 * CR-name generation, version suggestion, and the publish action.
 */
import { lazy } from "react";
import type { FeatureRoute } from "../app/routes.tsx";
import type { AuthoringContextValue } from "./types.ts";

/**
 * Lazy-load the authoring workspace so Monaco + CNCF diagram stay out of the main
 * bundle (they load only when the authoring route is opened).
 */
const AuthoringWorkspace = lazy(() =>
  import("./AuthoringWorkspace.tsx").then((m) => ({ default: m.AuthoringWorkspace })),
);

/**
 * E1 feature routes. The shell integrates these via `AppRoutes({ featureRoutes })`.
 * - /authoring → blank workspace
 * - /authoring/:draftId → resume a saved draft
 */
export const authoringRoutes: readonly FeatureRoute[] = [
  { path: "/authoring", element: <AuthoringWorkspace /> },
  { path: "/authoring/:draftId", element: <AuthoringWorkspace /> },
];

/**
 * Hand-off hook for E2 (publish flow). E2 calls this to obtain the current edited
 * portable document and parsed workflow identity. E2 blocks publish when
 * `parsedIdentity` is undefined (invalid YAML or missing required fields).
 *
 * STUB for E1: the full implementation requires React Context wrapping the workspace.
 * For E1 completion, this is a placeholder that E2 will consume. A working context
 * requires lifting state from AuthoringWorkspace into a provider, which is deferred
 * until E2 integration (or we can stub it now and E2 wires it).
 */
export const useAuthoringContext = (): AuthoringContextValue => {
  // STUB: E2 integration will wire this via React Context from AuthoringWorkspace.
  // For E1, return a minimal stub so the type contract is satisfied.
  return {
    workflowYaml: "",
    parsedIdentity: undefined,
    hasUnsavedChanges: false,
  };
};

// Re-export types E2 will import
export type { AuthoringContextValue, ParsedWorkflowIdentity } from "./types.ts";
export { INPUT_SCHEMA_SNIPPET } from "./types.ts";
