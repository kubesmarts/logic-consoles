/**
 * PublishWizard — E2 UI for publishing/updating workflows.
 *
 * Sources document from E1's useAuthoringContext. Integrates C's ResourceEditor for
 * full-CR review + dry-run + submit. Implements the publish-new-version default and
 * explicit-update-with-diff paths. Supports query params for update-entry integration.
 */

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
  Progress,

} from "@patternfly/react-core";
import { stringify as stringifyYaml } from "yaml";
import { useAuthoringContext, useAuthoringState } from "../AuthoringProvider.tsx";
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
import type {
  WorkflowVersionKey,
  KubeObject,
  LogicFlowDefinitionSpec,
  LogicFlowDefinitionStatus,
  DefinitionResource,
} from "../../contracts/index.ts";

type WizardStep = "configure" | "review" | "post-submit";
type PostSubmitState = "submitted" | "reconciling" | "reconciled" | "gateway-discovering" | "ready";

const MAX_GATEWAY_POLL_ATTEMPTS = 10;
const GATEWAY_POLL_INTERVAL_MS = 2000;

export const PublishWizard = (): ReactNode => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { kubernetes, session, gateway } = useConsole();
  const { workflowYaml, parsedIdentity, hasUnsavedChanges } = useAuthoringContext();
  const { setWorkflowYaml, setOriginalYaml } = useAuthoringState();

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
  const [postSubmitState, setPostSubmitState] = useState<PostSubmitState>("submitted");
  const [gatewayPollAttempts, setGatewayPollAttempts] = useState(0);
  const [deployedVersionKey, setDeployedVersionKey] = useState<WorkflowVersionKey | null>(null);
  const [gatewayDefinition, setGatewayDefinition] = useState<DefinitionResource | null>(null);

  // Load families to get suggested version and check for existing runtime
  const families = useWorkflowFamilies();
  const family = families.data?.find(
    (f) =>
      f.key.namespace === namespace &&
      f.key.workflowName === parsedIdentity?.workflowName,
  );

  // Load runtimes in the selected namespace
  const runtimes = useRuntimes(kubernetes, session.sessionId, namespace);

  // Initialize from query params (for update-entry integration)
  useEffect(() => {
    const modeParam = searchParams.get("mode");
    const nsParam = searchParams.get("namespace");
    const nameParam = searchParams.get("workflowName");
    const versionParam = searchParams.get("version");

    if (modeParam === "update" && nsParam && nameParam && versionParam) {
      setMode("update");
      setNamespace(nsParam);
      setVersion(versionParam);

      // Load deployed workflow YAML and seed authoring context
      const loadDeployedWorkflow = async () => {
        try {
          const resolution = await resolveWorkflowVersion(
            kubernetes,
            { namespace: nsParam, workflowName: nameParam, version: versionParam },
          );
          if (resolution.kind === "unambiguous") {
            const cr = await kubernetes.get<LogicFlowDefinitionSpec, LogicFlowDefinitionStatus>(
              resolution.resolution.resource,
            );
            const flowYaml = stringifyYaml(cr.spec?.flow);
            setWorkflowYaml(flowYaml);
            setOriginalYaml(flowYaml);
          }
        } catch (err) {
          setError(`Failed to load deployed workflow: ${String(err)}`);
        }
      };

      void loadDeployedWorkflow();
    }
  }, [searchParams, kubernetes, setWorkflowYaml, setOriginalYaml]);

  // Initialize namespace and suggested version
  useEffect(() => {
    if (parsedIdentity && !namespace && !searchParams.has("namespace")) {
      setNamespace(parsedIdentity.namespace);
    }
  }, [parsedIdentity, namespace, searchParams]);

  useEffect(() => {
    if (family && !version && !searchParams.has("version")) {
      const existingVersions = family.versions.map((v) => v.version.version);
      const suggested = suggestNextVersion(existingVersions);
      setVersion(suggested);
    } else if (!family && parsedIdentity && !version && !searchParams.has("version")) {
      setVersion(parsedIdentity.version);
    }
  }, [family, parsedIdentity, version, searchParams]);

  // For subsequent versions, lock to family's runtime
  useEffect(() => {
    if (family && family.runtimeName && !selectedRuntime) {
      setSelectedRuntime(family.runtimeName);
    }
  }, [family, selectedRuntime]);

  // Poll gateway catalog for routable state
  const gatewayPoll = useQuery({
    queryKey: ["gateway-poll", deployedVersionKey?.namespace, deployedVersionKey?.workflowName, deployedVersionKey?.version],
    queryFn: async () => {
      if (!deployedVersionKey) return null;
      const catalog = await gateway.listDefinitions();
      const entry = catalog.find(
        (d) =>
          d.namespace === deployedVersionKey.namespace &&
          d.name === deployedVersionKey.workflowName &&
          d.version === deployedVersionKey.version,
      );
      return entry ?? null;
    },
    enabled: postSubmitState === "gateway-discovering" && gatewayPollAttempts < MAX_GATEWAY_POLL_ATTEMPTS,
    refetchInterval: GATEWAY_POLL_INTERVAL_MS,
  });

  // Track gateway poll attempts
  useEffect(() => {
    if (gatewayPoll.isFetching && postSubmitState === "gateway-discovering") {
      setGatewayPollAttempts((prev) => prev + 1);
    }
  }, [gatewayPoll.isFetching, postSubmitState]);

  // Update post-submit state based on gateway poll
  useEffect(() => {
    if (gatewayPoll.data && postSubmitState === "gateway-discovering") {
      setGatewayDefinition(gatewayPoll.data);
      setPostSubmitState("ready");
    } else if (gatewayPollAttempts >= MAX_GATEWAY_POLL_ATTEMPTS && postSubmitState === "gateway-discovering") {
      // Max attempts reached, still show ready but note gateway discovery may be pending
      setPostSubmitState("ready");
    }
  }, [gatewayPoll.data, gatewayPollAttempts, postSubmitState]);

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
    const versionKey: WorkflowVersionKey = {
      namespace: result.metadata.namespace ?? "",
      workflowName: result.spec?.flow.document.name ?? "",
      version: result.spec?.flow.document.version ?? "",
    };
    setDeployedVersionKey(versionKey);
    setPostSubmitState("submitted");
    setGatewayPollAttempts(0);
    setStep("post-submit");
  }, []);

  const handleConflict = useCallback(() => {
    // On create conflict, suggest a different version
    if (mode === "create" && family) {
      const existingVersions = family.versions.map((v) => v.version.version);
      const suggested = suggestNextVersion([...existingVersions, version]);
      setVersion(suggested);
      setError(
        `Version ${version} was just published by another author. ` +
        `Suggested alternative: ${suggested}. Please review and try again.`,
      );
      setStep("configure");
    } else {
      setError("Conflict: the version was modified. Please reload and try again.");
      setStep("configure");
    }
  }, [mode, family, version]);

  // Monitor reconciliation state
  useEffect(() => {
    if (!submittedObject || postSubmitState !== "submitted") return;

    const checkReconciliation = async () => {
      try {
        const current = await kubernetes.get<LogicFlowDefinitionSpec, LogicFlowDefinitionStatus>({
          gvk: DEFINITION_GVK,
          name: submittedObject.metadata.name,
          namespace: submittedObject.metadata.namespace,
        });

        const reconciled =
          current.status?.observedGeneration !== undefined &&
          current.metadata.generation !== undefined &&
          current.status.observedGeneration === current.metadata.generation;

        if (reconciled) {
          setPostSubmitState("reconciled");
          // Start gateway discovery
          setTimeout(() => {
            setPostSubmitState("gateway-discovering");
          }, 500);
        } else {
          setPostSubmitState("reconciling");
          // Poll again
          setTimeout(checkReconciliation, 2000);
        }
      } catch {
        // If fetch fails, assume still reconciling and retry
        setTimeout(checkReconciliation, 2000);
      }
    };

    // Start reconciliation check
    setTimeout(checkReconciliation, 1000);
  }, [submittedObject, postSubmitState, kubernetes]);

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

  if (hasUnsavedChanges && !searchParams.has("mode")) {
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
          onWriteError={(err) => {
            const errorStr = String(err);
            if (errorStr.includes("conflict") || errorStr.includes("409")) {
              handleConflict();
            } else {
              setError(errorStr);
            }
          }}
        />

        <Button variant="link" onClick={() => setStep("configure")}>
          Back
        </Button>
      </PageSection>
    );
  }

  if (step === "post-submit") {
    const stateMessages = {
      submitted: "Workflow submitted",
      reconciling: "Reconciling...",
      reconciled: "Reconciled",
      "gateway-discovering": "Discovering in gateway...",
      ready: "Ready to run",
    };

    const stateDescriptions = {
      submitted: `${parsedIdentity.workflowName} @ ${version} has been submitted to ${namespace}.`,
      reconciling: "The operator is processing the workflow definition...",
      reconciled: "The workflow definition has been reconciled by the operator.",
      "gateway-discovering": "Waiting for the workflow to appear in the gateway catalog...",
      ready: gatewayDefinition
        ? "The workflow is routable and ready to run."
        : "The workflow has been published. Gateway discovery may still be pending.",
    };

    return (
      <PageSection>
        <EmptyState titleText={stateMessages[postSubmitState]} headingLevel="h2" status={postSubmitState === "ready" ? "success" : "info"}>
          <EmptyStateBody>
            <p>{stateDescriptions[postSubmitState]}</p>
            {submittedObject && (
              <>
                <p><strong>CR name:</strong> {submittedObject.metadata.name}</p>
                <p><strong>Namespace:</strong> {submittedObject.metadata.namespace}</p>
                {deployedVersionKey && (
                  <p><strong>Version key:</strong> {deployedVersionKey.namespace}/{deployedVersionKey.workflowName}@{deployedVersionKey.version}</p>
                )}
              </>
            )}
            {(postSubmitState === "reconciling" || postSubmitState === "gateway-discovering") && (
              <Progress
                value={postSubmitState === "reconciling" ? 50 : 75}
                title="Processing"
              />
            )}
            {postSubmitState === "ready" && gatewayDefinition && (
              <p><strong>Gateway links available:</strong> execute, executeSync, instances</p>
            )}
          </EmptyStateBody>
          <Button
            variant="primary"
            onClick={() => {
              if (deployedVersionKey) {
                navigate(
                  `/workflows/${encodeURIComponent(deployedVersionKey.namespace)}/${encodeURIComponent(deployedVersionKey.workflowName)}/${encodeURIComponent(deployedVersionKey.version)}`,
                );
              }
            }}
            isDisabled={!deployedVersionKey}
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
