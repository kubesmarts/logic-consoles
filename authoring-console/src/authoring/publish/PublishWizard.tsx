/**
 * PublishWizard — E2 UI for publishing/updating workflows.
 *
 * Sources document from E1's useAuthoringContext. Integrates C's ResourceEditor for
 * full-CR review + dry-run + submit. Implements the publish-new-version default and
 * explicit-update-with-diff paths.
 */

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Content,
  EmptyState,
  EmptyStateBody,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  PageSection,
  Radio,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  TextInput,
  Title,
  Bullseye,
  MenuToggle,
} from "@patternfly/react-core";
import { useAuthoringContext } from "../AuthoringProvider.tsx";
import { useConsole } from "../../app/ConsoleContext.tsx";
import { useWorkflowFamilies } from "../../app/queries.ts";
import { ResourceEditor } from "../../resource-editor/ResourceEditor.tsx";
import {
  buildPublishCandidate,
  useRuntimes,
  suggestNextVersion,
  resolveWorkflowVersion,
  type PublishMode,
  type PublishCandidate,
  DEFINITION_GVK,
} from "./index.ts";
import type { WorkflowVersionKey, KubeObject, LogicFlowDefinitionSpec, LogicFlowDefinitionStatus } from "../../contracts/index.ts";

type WizardStep = "configure" | "review" | "submitted";

export const PublishWizard = (): ReactNode => {
  const navigate = useNavigate();
  const { kubernetes, session } = useConsole();
  const { workflowYaml, parsedIdentity, hasUnsavedChanges } = useAuthoringContext();

  const [step, setStep] = useState<WizardStep>("configure");
  const [mode, setMode] = useState<PublishMode>("create");
  const [namespace, setNamespace] = useState("");
  const [version, setVersion] = useState("");
  const [selectedRuntime, setSelectedRuntime] = useState("");
  const [runtimeSelectOpen, setRuntimeSelectOpen] = useState(false);
  const [candidate, setCandidate] = useState<PublishCandidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ambiguityError, setAmbiguityError] = useState<string | null>(null);
  const [submittedObject, setSubmittedObject] = useState<KubeObject<LogicFlowDefinitionSpec, LogicFlowDefinitionStatus> | null>(null);

  // Load families to get suggested version and check for existing runtime
  const families = useWorkflowFamilies();
  const family = families.data?.find(
    (f) =>
      f.key.namespace === namespace &&
      f.key.workflowName === parsedIdentity?.workflowName,
  );

  // Load runtimes in the selected namespace
  const runtimes = useRuntimes(kubernetes, session.sessionId, namespace);

  // Initialize namespace and suggested version
  useEffect(() => {
    if (parsedIdentity && !namespace) {
      setNamespace(parsedIdentity.namespace);
    }
  }, [parsedIdentity, namespace]);

  useEffect(() => {
    if (family && !version) {
      const existingVersions = family.versions.map((v) => v.version.version);
      const suggested = suggestNextVersion(existingVersions);
      setVersion(suggested);
    } else if (!family && parsedIdentity && !version) {
      setVersion(parsedIdentity.version);
    }
  }, [family, parsedIdentity, version]);

  // For subsequent versions, lock to family's runtime
  useEffect(() => {
    if (family && family.runtimeName && !selectedRuntime) {
      setSelectedRuntime(family.runtimeName);
    }
  }, [family, selectedRuntime]);

  const handlePreparePublish = useCallback(async () => {
    if (!parsedIdentity) {
      setError("Cannot publish: workflow identity is invalid or missing");
      return;
    }

    if (!selectedRuntime) {
      setError("Please select a runtime");
      return;
    }

    setError(null);
    setAmbiguityError(null);

    try {
      // Check for ambiguity in update mode
      if (mode === "update") {
        const versionKey: WorkflowVersionKey = {
          namespace,
          workflowName: parsedIdentity.workflowName,
          version,
        };
        const resolution = await resolveWorkflowVersion(kubernetes, versionKey);
        if (resolution.kind === "ambiguous") {
          setAmbiguityError(
            `Multiple CRs claim version ${version}. Cannot update an ambiguous version. ` +
            `Candidates: ${resolution.candidates.map((c) => c.name).join(", ")}`,
          );
          return;
        }
        if (resolution.kind === "not-found") {
          setError(`Version ${version} not found. Cannot update a non-existent version.`);
          return;
        }
      }

      // Build candidate
      const built = await buildPublishCandidate(
        mode,
        workflowYaml,
        namespace,
        parsedIdentity.workflowName,
        version,
        selectedRuntime,
        kubernetes,
      );

      setCandidate(built);
      setStep("review");
    } catch (err) {
      setError(String(err));
    }
  }, [mode, workflowYaml, namespace, parsedIdentity, version, selectedRuntime, kubernetes]);

  const handleWriteSuccess = useCallback((result: KubeObject<LogicFlowDefinitionSpec, LogicFlowDefinitionStatus>) => {
    setSubmittedObject(result);
    setStep("submitted");
  }, []);

  if (!parsedIdentity) {
    return (
      <PageSection>
        <EmptyState titleText="Invalid workflow" headingLevel="h2" status="danger">
          <EmptyStateBody>
            The workflow document is invalid or missing required fields (name, version, namespace).
            Please fix the workflow YAML before publishing.
          </EmptyStateBody>
          <Button variant="primary" onClick={() => navigate("/authoring")}>
            Back to authoring
          </Button>
        </EmptyState>
      </PageSection>
    );
  }

  if (hasUnsavedChanges) {
    return (
      <PageSection>
        <Alert
          variant="warning"
          isInline
          title="You have unsaved changes"
        >
          Please save your draft before publishing to ensure your changes are preserved.
        </Alert>
        <Button variant="primary" onClick={() => navigate("/authoring")}>
          Back to authoring
        </Button>
      </PageSection>
    );
  }

  if (step === "configure") {
    return (
      <PageSection>
        <Title headingLevel="h1">Publish workflow</Title>
        <Content component="p">
          Workflow: {parsedIdentity.workflowName} @ {parsedIdentity.version}
        </Content>

        {error && (
          <Alert variant="danger" isInline title="Error">
            {error}
          </Alert>
        )}

        {ambiguityError && (
          <Alert variant="warning" isInline title="Ambiguous version">
            {ambiguityError}
          </Alert>
        )}

        <Form>
          <FormGroup label="Namespace" isRequired fieldId="namespace">
            <TextInput
              id="namespace"
              value={namespace}
              onChange={(_event, value) => setNamespace(value)}
              isDisabled={!!family}
            />
            {family && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    Namespace is locked to the family's namespace
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label="Publish mode" isRequired fieldId="mode">
            <Radio
              id="mode-create"
              name="mode"
              label="Publish new version (default)"
              description="Create a distinct definition on the family's runtime"
              isChecked={mode === "create"}
              onChange={() => setMode("create")}
            />
            <Radio
              id="mode-update"
              name="mode"
              label="Update existing version"
              description="Update the selected CR in-place (shows diff before submit)"
              isChecked={mode === "update"}
              onChange={() => setMode("update")}
            />
          </FormGroup>

          <FormGroup label="Version" isRequired fieldId="version">
            <TextInput
              id="version"
              value={version}
              onChange={(_event, value) => setVersion(value)}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  {mode === "create"
                    ? `Suggested: ${version} (next unused version)`
                    : "Enter the version to update"}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="Runtime" isRequired fieldId="runtime">
            {runtimes.isPending ? (
              <Spinner size="md" aria-label="Loading runtimes" />
            ) : runtimes.data && runtimes.data.length > 0 ? (
              <>
                <Select
                  id="runtime-select"
                  isOpen={runtimeSelectOpen}
                  selected={selectedRuntime}
                  onSelect={(_event, value) => {
                    setSelectedRuntime(String(value));
                    setRuntimeSelectOpen(false);
                  }}
                  onOpenChange={(isOpen) => setRuntimeSelectOpen(isOpen)}
                  toggle={(toggleRef) => (
                    <MenuToggle
                      ref={toggleRef}
                      onClick={() => setRuntimeSelectOpen(!runtimeSelectOpen)}
                      isExpanded={runtimeSelectOpen}
                      isDisabled={!!family && !!family.runtimeName}
                    >
                      {selectedRuntime || "Select a runtime"}
                    </MenuToggle>
                  )}
                >
                  <SelectList>
                    {runtimes.data.map((runtime) => (
                      <SelectOption key={runtime.name} value={runtime.name}>
                        {runtime.name} ({runtime.persistenceMode})
                      </SelectOption>
                    ))}
                  </SelectList>
                </Select>
                {family && family.runtimeName && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>
                        Runtime is locked to the family's runtime: {family.runtimeName}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </>
            ) : (
              <Alert variant="warning" isInline title="No runtimes available">
                No runtimes found in namespace {namespace}. Please create a runtime first.
              </Alert>
            )}
          </FormGroup>
        </Form>

        <Button
          variant="primary"
          onClick={handlePreparePublish}
          isDisabled={!selectedRuntime || !version || !namespace}
        >
          Review {mode === "create" ? "new version" : "update"}
        </Button>
        <Button variant="link" onClick={() => navigate("/authoring")}>
          Cancel
        </Button>
      </PageSection>
    );
  }

  if (step === "review") {
    if (!candidate) {
      return (
        <PageSection>
          <Bullseye>
            <Spinner aria-label="Preparing review" />
          </Bullseye>
        </PageSection>
      );
    }

    return (
      <PageSection>
        <Title headingLevel="h1">
          {mode === "create" ? "Review new version" : "Review update"}
        </Title>
        <Content component="p">
          Namespace: {namespace} | Workflow: {parsedIdentity.workflowName} @ {version} |
          Runtime: {selectedRuntime} | CR name: {candidate.crName}
        </Content>

        {error && (
          <Alert variant="danger" isInline title="Error">
            {error}
          </Alert>
        )}

        <ResourceEditor
          transport={kubernetes}
          ref={{
            gvk: DEFINITION_GVK,
            name: candidate.crName,
            namespace,
          }}
          seed={candidate.candidate}
          verb={mode}
          deployed={candidate.deployed}
          onWriteSuccess={handleWriteSuccess}
        />

        <Button variant="link" onClick={() => setStep("configure")}>
          Back
        </Button>
      </PageSection>
    );
  }

  if (step === "submitted") {
    return (
      <PageSection>
        <EmptyState titleText="Workflow published" headingLevel="h2" status="success">
          <EmptyStateBody>
            {parsedIdentity.workflowName} @ {version} has been published to {namespace}.
            {submittedObject && (
              <p>CR: {submittedObject.metadata.name}</p>
            )}
          </EmptyStateBody>
          <Button
            variant="primary"
            onClick={() =>
              navigate(
                `/workflows/${encodeURIComponent(namespace)}/${encodeURIComponent(parsedIdentity.workflowName)}/${encodeURIComponent(version)}`,
              )
            }
          >
            View workflow version
          </Button>
          <Button variant="link" onClick={() => navigate("/authoring")}>
            Back to authoring
          </Button>
        </EmptyState>
      </PageSection>
    );
  }

  return null;
};
