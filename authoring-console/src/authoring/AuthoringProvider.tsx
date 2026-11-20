/**
 * AuthoringProvider — React Context for E2 hand-off.
 *
 * Wraps the authoring workspace and exposes live state (workflowYaml, parsedIdentity,
 * hasUnsavedChanges) via `useAuthoringContext`. E2 imports this hook to obtain the
 * current document for publishing.
 */
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { parseWorkflowIdentity } from "./validation.ts";
import type { AuthoringContextValue, ParsedWorkflowIdentity } from "./types.ts";
import { useConsole } from "../app/ConsoleContext.tsx";

const BLANK_WORKFLOW_TEMPLATE = `document:
  dsl: '1.0.0'
  namespace: default
  name: my-workflow
  version: '1.0.0'
do:
  - step1:
      set:
        result: "Hello from my workflow"
`;

interface AuthoringState {
  readonly workflowYaml: string;
  readonly setWorkflowYaml: (yaml: string | ((current: string) => string)) => void;
  readonly currentDraftId: string | undefined;
  readonly setCurrentDraftId: (id: string | undefined) => void;
  readonly originalYaml: string;
  readonly setOriginalYaml: (yaml: string) => void;
  readonly hasUnsavedChanges: boolean;
  readonly parsedIdentity: ParsedWorkflowIdentity | undefined;
}

const AuthoringContext = createContext<AuthoringState | null>(null);

export const AuthoringProvider = ({ children }: { readonly children: ReactNode }): ReactNode => {
  const { storage } = useConsole();
  const { draftId } = useParams<{ draftId?: string }>();

  const [workflowYaml, setWorkflowYaml] = useState(BLANK_WORKFLOW_TEMPLATE);
  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(draftId);
  const [originalYaml, setOriginalYaml] = useState(BLANK_WORKFLOW_TEMPLATE);

  const hasUnsavedChanges = workflowYaml !== originalYaml;
  const parsedIdentity = parseWorkflowIdentity(workflowYaml);

  // Load draft on mount if draftId is provided
  useEffect(() => {
    if (draftId) {
      const draft = storage.getDraft(draftId);
      if (draft) {
        setWorkflowYaml(draft.workflowYaml);
        setOriginalYaml(draft.workflowYaml);
        setCurrentDraftId(draft.id);
      }
    }
  }, [draftId, storage]);

  const value: AuthoringState = {
    workflowYaml,
    setWorkflowYaml,
    currentDraftId,
    setCurrentDraftId,
    originalYaml,
    setOriginalYaml,
    hasUnsavedChanges,
    parsedIdentity,
  };

  return <AuthoringContext.Provider value={value}>{children}</AuthoringContext.Provider>;
};

/**
 * Internal hook for the workspace to access mutable state.
 */
export const useAuthoringState = (): AuthoringState => {
  const value = useContext(AuthoringContext);
  if (!value) {
    throw new Error("useAuthoringState must be used within AuthoringProvider");
  }
  return value;
};

/**
 * Public E2 hand-off hook. Returns read-only context (workflowYaml, parsedIdentity,
 * hasUnsavedChanges). E2 uses this to obtain the current document for publishing.
 */
export const useAuthoringContext = (): AuthoringContextValue => {
  const value = useContext(AuthoringContext);
  if (!value) {
    throw new Error("useAuthoringContext must be used within AuthoringProvider");
  }
  return {
    workflowYaml: value.workflowYaml,
    parsedIdentity: value.parsedIdentity,
    hasUnsavedChanges: value.hasUnsavedChanges,
  };
};

export { BLANK_WORKFLOW_TEMPLATE };
