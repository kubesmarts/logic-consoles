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
import { isKubernetesWriteRejection, OperatorLabels } from "../../contracts/index.ts";
import { operationLink } from "../../execution/operation-link.ts";
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
type PostSubmitState = "submitted" | "reconciling" | "reconciled" | "gateway-discovering" | "gateway-pending" | "ready";

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

  const sourceMode = searchParams.get("mode");
  const sourceNamespace = searchParams.get("namespace");
  const sourceName = searchParams.get("workflowName");
  const sourceVersion = searchParams.get("version");
  const sourceKey = sourceMode && sourceNamespace && sourceName && sourceVersion ? searchParams.toString() : "";
  const [loadedSource, setLoadedSource] = useState("");
  const sourcePending = loadedSource !== sourceKey;

  const workflowName = parsedIdentity?.workflowName;
  const familyQuery = useQuery({
    queryKey: [session.sessionId, session.context.contextName, "publish-family", namespace, workflowName],
    enabled: !sourcePending && Boolean(namespace && workflowName),
    queryFn: async ({signal}) => {
      const list = await kubernetes.list<LogicFlowDefinitionSpec>(DEFINITION_GVK, {
        namespace, labelSelector: `${OperatorLabels.workflowName}=${workflowName}`,
      }, signal);
      if (!list.items.length) return null;
      const runtimes = new Set(list.items.map(item => item.spec?.runtimeRef.name));
      if (runtimes.size !== 1 || runtimes.has(undefined)) throw new Error("The family has inconsistent runtime references.");
      return {
        runtimeName: list.items[0]?.spec?.runtimeRef.name,
        versions: list.items.flatMap(item => item.metadata.labels?.[OperatorLabels.workflowVersion] ?? []),
      };
    },
  });
  const family = familyQuery.data;

  // Load runtimes in the selected namespace
  const runtimes = useRuntimes(kubernetes, session.sessionId, namespace);

  // Load the selected CR by label identity before enabling review. A failed
  // lookup must never offer the blank template as an update to a deployed CR.
  useEffect(() => {
    if (!sourceKey || !sourceNamespace || !sourceName || !sourceVersion) return;
    const controller = new AbortController();
    const key = {namespace:sourceNamespace, workflowName:sourceName, version:sourceVersion};
    setLoadedSource("");
    setError(null);
    setMode(sourceMode === "update" ? "update" : "create");
    setNamespace(sourceNamespace);
    setVersion(sourceMode === "update" ? sourceVersion : "");
    void (async () => {
      try {
        const resolution = await resolveWorkflowVersion(kubernetes, key, controller.signal);
        if (resolution.kind !== "unambiguous") {
          throw new Error(resolution.kind === "ambiguous" ? "Multiple definitions claim this version." : "The selected definition no longer exists.");
        }
        const cr = await kubernetes.get<LogicFlowDefinitionSpec>(resolution.resolution.resource, controller.signal);
        if (controller.signal.aborted) return;
        const flow = cr.spec?.flow;
        if (flow?.document.name !== key.workflowName || flow.document.version !== key.version) {
          throw new Error("The deployed document no longer matches the selected version.");
        }
        const yaml = stringifyYaml(flow);
        setWorkflowYaml(yaml);
        setOriginalYaml(yaml);
        setLoadedSource(sourceKey);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load the selected workflow.");
      }
    })();
    return () => controller.abort();
  }, [sourceKey, sourceMode, sourceNamespace, sourceName, sourceVersion, kubernetes, setWorkflowYaml, setOriginalYaml]);

  // Initialize namespace and suggested version
  useEffect(() => {
    if (parsedIdentity && !namespace && !searchParams.has("namespace")) {
      setNamespace(parsedIdentity.namespace);
    }
  }, [parsedIdentity, namespace, searchParams]);

  useEffect(() => {
    if (!familyQuery.isSuccess || sourcePending || (sourceKey && mode === "update")) return;
    if (family && !version) {
      const existingVersions = family.versions;
      const suggested = suggestNextVersion(existingVersions);
      setVersion(suggested);
    } else if (!family && parsedIdentity && !version) {
      setVersion(parsedIdentity.version);
    }
  }, [family, familyQuery.isSuccess, parsedIdentity, version, sourcePending, sourceKey, mode]);

  // For subsequent versions, lock to family's runtime
  useEffect(() => {
    if (family?.runtimeName && family.runtimeName !== selectedRuntime) {
      setSelectedRuntime(family.runtimeName);
    }
  }, [family, selectedRuntime]);

  // Poll gateway catalog for routable state
  const gatewayPoll = useQuery({
    queryKey: [session.sessionId, session.context.contextName, "gateway-poll", deployedVersionKey?.namespace, deployedVersionKey?.workflowName, deployedVersionKey?.version],
    queryFn: async ({signal}) => {
      if (!deployedVersionKey) return null;
      const catalog = await gateway.listDefinitions(signal);
      const entry = catalog.find(
        (d) =>
          d.namespace === deployedVersionKey.namespace &&
          d.name === deployedVersionKey.workflowName &&
          d.version === deployedVersionKey.version,
      );
      return entry && (operationLink(entry, "execute") || operationLink(entry, "executeSync")) ? entry : null;
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
    } else if (!gatewayPoll.isFetching && gatewayPollAttempts >= MAX_GATEWAY_POLL_ATTEMPTS && postSubmitState === "gateway-discovering") {
      setPostSubmitState("gateway-pending");
    }
  }, [gatewayPoll.data, gatewayPoll.isFetching, gatewayPollAttempts, postSubmitState]);

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
    if (mode === "create") {
      const existingVersions = family?.versions ?? [];
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

  // Poll only while this published object is mounted. Both the request and
  // scheduled follow-up are cancelled when the user changes route or session.
  useEffect(() => {
    if (!submittedObject) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      if (!submittedObject || controller.signal.aborted) return;
      try {
        const current = await kubernetes.get<LogicFlowDefinitionSpec, LogicFlowDefinitionStatus>({
          gvk: DEFINITION_GVK, name: submittedObject.metadata.name, namespace: submittedObject.metadata.namespace,
        }, controller.signal);
        if (controller.signal.aborted) return;
        const generation = current.metadata.generation;
        const ready = current.status?.conditions?.find(condition => condition.type === "Ready");
        if (generation !== undefined && current.status?.observedGeneration === generation && ready?.status === "True") {
          setPostSubmitState("gateway-discovering");
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      setPostSubmitState("reconciling");
      timer = setTimeout(check, 2000);
    }
    timer = setTimeout(check, 1000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [submittedObject, kubernetes]);

  if (sourcePending) return <PageSection>
    {error ? <Alert isInline variant="danger" title="Cannot load the selected workflow">{error}</Alert>
      : <Spinner aria-label="Loading selected workflow" />}
    <Button variant="link" onClick={() => navigate("/workflows")}>Back to workflows</Button>
  </PageSection>;

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

        {familyQuery.isError && <Alert isInline variant="warning" title="Cannot verify the workflow family in this namespace">{familyQuery.error.message}</Alert>}
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
              onChange={() => { setMode("create"); setVersion(family ? suggestNextVersion(family.versions) : parsedIdentity.version); }}
            />
            <Radio
              id="mode-update"
              name="mode"
              label="Update existing version"
              description="Update the selected CR in-place (shows diff before submit)"
              isChecked={mode === "update"}
              onChange={() => { setMode("update"); setVersion(parsedIdentity.version); }}
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
          isDisabled={!familyQuery.isSuccess || !selectedRuntime || !version || !namespace}
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
            if ((isKubernetesWriteRejection(err) && err.writeError.kind === "conflict") || errorStr.includes("conflict") || errorStr.includes("409")) {
              handleConflict();
            } else if (err instanceof Error) {
              setError(err.message);
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
      "gateway-pending": "Gateway routing pending",
      ready: "Ready to run",
    };

    const stateDescriptions = {
      submitted: `${parsedIdentity.workflowName} @ ${version} has been submitted to ${namespace}.`,
      reconciling: "The operator is processing the workflow definition...",
      reconciled: "The workflow definition has been reconciled by the operator.",
      "gateway-discovering": "Waiting for the workflow to appear in the gateway catalog...",
      "gateway-pending": "The gateway has not advertised a versioned execution link yet.",
      ready: "The gateway advertises an execution link for this version.",
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
              <p><strong>Gateway links available:</strong> {Object.keys(gatewayDefinition._links).join(", ")}</p>
            )}
          </EmptyStateBody>
          {postSubmitState === "gateway-pending" && <Button variant="secondary" onClick={() => {
            setGatewayPollAttempts(0);
            setPostSubmitState("gateway-discovering");
          }}>Check gateway again</Button>}
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
