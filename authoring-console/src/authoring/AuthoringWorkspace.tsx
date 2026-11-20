/**
 * Authoring workspace — E1 deliverable: blank or example-seeded portable workflow
 * document with live DSL validation, CNCF diagram preview, and local draft
 * save/resume/export.
 *
 * E1 does NOT publish — that is E2. This workspace produces a finished draft that E2
 * can publish via the hand-off hook (`useAuthoringContext`).
 */
import { useState, type ReactNode } from "react";
import { useNavigate, useBlocker } from "react-router-dom";
import {
  Button,
  Content,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  PageSection,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Alert,
} from "@patternfly/react-core";
import { WorkflowEditor } from "./WorkflowEditor.tsx";
import { ExampleCatalog } from "./ExampleCatalog.tsx";
import { INPUT_SCHEMA_SNIPPET } from "./types.ts";
import { useAuthoringState, BLANK_WORKFLOW_TEMPLATE } from "./AuthoringProvider.tsx";
import { useConsole } from "../app/ConsoleContext.tsx";
import type { WorkflowDraft, DraftSaveOutcome } from "../contracts/index.ts";

/**
 * Pure function to decide whether navigation should be blocked.
 * Exported for unit testing.
 */
export const shouldBlockNavigation = (
  hasUnsavedChanges: boolean,
  currentPath: string,
  nextPath: string,
): boolean => {
  return hasUnsavedChanges && currentPath !== nextPath;
};

export const AuthoringWorkspace = (): ReactNode => {
  const { storage, session } = useConsole();
  const navigate = useNavigate();
  const {
    workflowYaml,
    setWorkflowYaml,
    currentDraftId,
    setCurrentDraftId,
    setOriginalYaml,
    hasUnsavedChanges,
    parsedIdentity,
  } = useAuthoringState();

  const [showExampleCatalog, setShowExampleCatalog] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [lastSaveOutcome, setLastSaveOutcome] = useState<DraftSaveOutcome | undefined>(undefined);

  // Guard against unsaved work on navigation
  useBlocker(({ currentLocation, nextLocation }) =>
    shouldBlockNavigation(hasUnsavedChanges, currentLocation.pathname, nextLocation.pathname),
  );

  const handleSaveDraft = (): void => {
    const id = currentDraftId ?? `draft-${Date.now()}`;
    const title = parsedIdentity?.workflowName ?? "Untitled workflow";
    const draft: WorkflowDraft = {
      id,
      title,
      workflowYaml,
      target: {
        contextName: session.context.contextName,
        namespace: "default",
      },
      createdAt: currentDraftId
        ? storage.getDraft(currentDraftId)?.createdAt ?? new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const outcome = storage.saveDraft(draft);
    setLastSaveOutcome(outcome);

    if (outcome.ok) {
      setOriginalYaml(workflowYaml);
      setCurrentDraftId(id);
      setSaveError(undefined);
      // Update URL if this is a new draft
      if (!currentDraftId) {
        navigate(`/authoring/${id}`, { replace: true });
      }
    } else {
      const errorMsg =
        outcome.reason === "quota-exceeded"
          ? "Storage quota exceeded. Export your work to save it."
          : "Failed to save draft. Your work is kept in memory — use Export to save it.";
      setSaveError(errorMsg);
    }
  };

  const handleExportYaml = (): void => {
    const draft: WorkflowDraft = {
      id: currentDraftId ?? `draft-${Date.now()}`,
      title: parsedIdentity?.workflowName ?? "Untitled workflow",
      workflowYaml,
      target: {
        contextName: session.context.contextName,
        namespace: "default",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const exported = storage.exportDraftYaml(draft);
    const blob = new Blob([exported], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${parsedIdentity?.workflowName ?? "workflow"}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRemoveDraft = (): void => {
    if (currentDraftId) {
      storage.removeDraft(currentDraftId);
      navigate("/authoring");
    }
  };

  const handleNewDraft = (): void => {
    if (hasUnsavedChanges) {
      const confirmed = confirm("You have unsaved changes. Continue to new draft?");
      if (!confirmed) return;
    }
    setWorkflowYaml(BLANK_WORKFLOW_TEMPLATE);
    setOriginalYaml(BLANK_WORKFLOW_TEMPLATE);
    setCurrentDraftId(undefined);
    setSaveError(undefined);
    setLastSaveOutcome(undefined);
    navigate("/authoring");
  };

  const handleSelectExample = (yaml: string): void => {
    if (hasUnsavedChanges) {
      const confirmed = confirm("You have unsaved changes. Continue to load example?");
      if (!confirmed) return;
    }
    setWorkflowYaml(yaml);
    setOriginalYaml(yaml);
    setCurrentDraftId(undefined);
    setSaveError(undefined);
    setLastSaveOutcome(undefined);
    navigate("/authoring");
  };

  const handleInsertSnippet = (): void => {
    // Simple insert at cursor position (enhanced UX could use Monaco API for cursor position)
    const snippet = `\n${INPUT_SCHEMA_SNIPPET.yaml}`;
    setWorkflowYaml((current) => current + snippet);
  };

  return (
    <>
      <PageSection>
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <Title headingLevel="h1">Author workflow</Title>
            </ToolbarItem>
            <ToolbarItem variant="separator" />
            <ToolbarItem>
              <Button variant="primary" onClick={handleSaveDraft}>
                Save draft
              </Button>
            </ToolbarItem>
            <ToolbarItem>
              <Button
                variant="secondary"
                onClick={() => navigate("/publish")}
                isDisabled={!parsedIdentity || hasUnsavedChanges}
              >
                Publish workflow
              </Button>
            </ToolbarItem>
            <ToolbarItem>
              <Button variant="secondary" onClick={() => setShowExampleCatalog(true)}>
                Start from example
              </Button>
            </ToolbarItem>
            <ToolbarItem>
              <Dropdown
                isOpen={showActionsMenu}
                onOpenChange={setShowActionsMenu}
                toggle={(toggleRef) => (
                  <MenuToggle ref={toggleRef} onClick={() => setShowActionsMenu(!showActionsMenu)}>
                    Actions
                  </MenuToggle>
                )}
              >
                <DropdownList>
                  <DropdownItem key="new" onClick={handleNewDraft}>
                    New blank workflow
                  </DropdownItem>
                  <DropdownItem
                    key="snippet"
                    onClick={handleInsertSnippet}
                    description={INPUT_SCHEMA_SNIPPET.description}
                  >
                    {INPUT_SCHEMA_SNIPPET.label}
                  </DropdownItem>
                  <DropdownItem key="export" onClick={handleExportYaml}>
                    Export YAML
                  </DropdownItem>
                  {currentDraftId && (
                    <DropdownItem key="remove" onClick={handleRemoveDraft}>
                      Remove draft
                    </DropdownItem>
                  )}
                </DropdownList>
              </Dropdown>
            </ToolbarItem>
            <ToolbarItem align={{ default: "alignEnd" }}>
              {hasUnsavedChanges && (
                <Content component="small" style={{ color: "var(--pf-t--global--color--status--warning--default)" }}>
                  Unsaved changes
                </Content>
              )}
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>

        {saveError && (
          <Alert
            variant="danger"
            isInline
            title="Save failed"
            style={{ marginTop: "1rem" }}
            actionClose={<Button variant="plain" onClick={() => setSaveError(undefined)} />}
          >
            {saveError}
          </Alert>
        )}

        {lastSaveOutcome?.ok && (
          <Alert
            variant="success"
            isInline
            title="Draft saved"
            style={{ marginTop: "1rem" }}
            timeout={3000}
            onTimeout={() => setLastSaveOutcome(undefined)}
          />
        )}
      </PageSection>

      <WorkflowEditor value={workflowYaml} onChange={setWorkflowYaml} />

      <ExampleCatalog
        isOpen={showExampleCatalog}
        onClose={() => setShowExampleCatalog(false)}
        onSelectExample={handleSelectExample}
      />
    </>
  );
};
