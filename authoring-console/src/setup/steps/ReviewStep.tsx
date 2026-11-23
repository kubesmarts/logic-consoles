/**
 * Review + dry-run + submit step (Deliverable 7).
 * Uses ResourceEditor (from C) for full-CR review/dry-run/submit.
 * Shows per-component readiness via reconciliation state.
 */
import { type ReactNode, useState, useCallback, useRef } from "react";
import { PageSection, Title, Button, EmptyState, EmptyStateBody, Alert, Spinner } from "@patternfly/react-core";
import { Table, Thead, Tbody, Tr, Th, Td } from "@patternfly/react-table";
import { CheckCircleIcon, ClockIcon, ExclamationCircleIcon } from "@patternfly/react-icons";
import { useConsole } from "../../app/ConsoleContext.tsx";
import { ResourceEditor } from "../../resource-editor/ResourceEditor.tsx";
import { useResourceEditor } from "../../resource-editor/useResourceEditor.ts";
import { LOGIC_GROUP, LOGIC_VERSION, LogicKinds, type KubeObject } from "../../contracts/index.ts";
import type { PlatformSetupDraft } from "../types.ts";
import { buildPlatformCR, type ClusterLogicPlatformCRSpec, type ClusterLogicPlatformCRStatus } from "../buildPlatformCR.ts";

interface ReviewStepProps {
  readonly draft: PlatformSetupDraft;
  readonly onComplete?: () => void;
  readonly onCancel?: () => void;
  readonly editMode?: boolean;
  readonly existingPlatform?: KubeObject<ClusterLogicPlatformCRSpec, ClusterLogicPlatformCRStatus> | null;
}

type PostSubmitState = "ready" | "submitted" | "reconciling" | "reconciled" | "error";

export const ReviewStep = ({ draft, onComplete, onCancel, editMode = false, existingPlatform }: ReviewStepProps): ReactNode => {
  const { kubernetes } = useConsole();
  const [postSubmitState, setPostSubmitState] = useState<PostSubmitState>("ready");
  const [submittedObject, setSubmittedObject] = useState<KubeObject<ClusterLogicPlatformCRSpec, ClusterLogicPlatformCRStatus> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Build the CR from draft
  const seed = buildPlatformCR(draft, editMode ? existingPlatform : undefined);

  // Use ResourceEditor hook for reconciliation tracking
  const editorController = useResourceEditor<ClusterLogicPlatformCRSpec, ClusterLogicPlatformCRStatus>({
    transport: kubernetes,
    ref: {
      gvk: { group: LOGIC_GROUP, version: LOGIC_VERSION, kind: LogicKinds.ClusterLogicPlatform },
      name: seed.metadata.name,
    },
    seed,
    verb: editMode ? "update" : "create",
    deployed: editMode ? existingPlatform ?? undefined : undefined,
  });

  const handleWriteSuccess = useCallback((result: KubeObject<ClusterLogicPlatformCRSpec, ClusterLogicPlatformCRStatus>) => {
    setSubmittedObject(result);
    setPostSubmitState("submitted");
    setError(null);

    // Start reconciliation tracking using C's API
    if (!abortControllerRef.current) {
      abortControllerRef.current = new AbortController();
    }
    editorController.startReconciliation(result, abortControllerRef.current.signal);
  }, [editorController]);

  const handleWriteError = useCallback((err: unknown) => {
    setError(String(err));
    setPostSubmitState("error");
  }, []);

  // Update post-submit state based on reconciliation
  const reconciliation = editorController.reconciliation;
  if (reconciliation && postSubmitState !== "error") {
    if (reconciliation.reconciled && postSubmitState !== "reconciled") {
      setPostSubmitState("reconciled");
    } else if (!reconciliation.reconciled && reconciliation.observed && postSubmitState === "submitted") {
      setPostSubmitState("reconciling");
    }
  }

  const observedObject = reconciliation?.observed ?? submittedObject;

  // If submitted, show readiness screen
  if (postSubmitState !== "ready") {
    const stateMessages = {
      submitted: "Platform submitted",
      reconciling: "Platform reconciling",
      reconciled: "Platform ready",
      error: "Submission failed",
      ready: "",
    };

    const stateDescriptions = {
      submitted: "The ClusterLogicPlatform has been submitted. Waiting for operator to process it.",
      reconciling: "The operator is processing the platform configuration.",
      reconciled: "The platform has been reconciled and is ready.",
      error: "Failed to submit the platform. Please check the error below.",
      ready: "",
    };

    if (postSubmitState === "error") {
      return (
        <PageSection>
          <EmptyState titleText={stateMessages.error} headingLevel="h2" status="danger">
            <EmptyStateBody>
              <div>{stateDescriptions.error}</div>
              <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#f5f5f5", borderRadius: "4px" }}>
                <code>{error}</code>
              </div>
            </EmptyStateBody>
            <Button variant="primary" onClick={() => setPostSubmitState("ready")}>
              Back to review
            </Button>
          </EmptyState>
        </PageSection>
      );
    }

    return (
      <PageSection>
        <Title headingLevel="h1">{stateMessages[postSubmitState]}</Title>
        <div style={{ marginTop: "1rem", marginBottom: "2rem" }}>
          {reconciliation?.error && submittedObject ? (
            <Alert variant="warning" title={reconciliation.error} isInline>
              <Button variant="link" onClick={() => editorController.startReconciliation(submittedObject)}>Retry status</Button>
            </Alert>
          ) : postSubmitState === "submitted" || postSubmitState === "reconciling" ? (
            <Alert variant="info" title={stateDescriptions[postSubmitState]} isInline>
              <Spinner size="md" style={{ marginRight: "0.5rem" }} />
              Checking operator status...
            </Alert>
          ) : (
            <Alert variant="success" title={stateDescriptions[postSubmitState]} isInline />
          )}
        </div>

        {submittedObject && (
          <>
            <dl style={{ marginBottom: "2rem" }}>
              <dt><strong>Platform name:</strong></dt>
              <dd>{submittedObject.metadata.name}</dd>
              <dt style={{ marginTop: "0.5rem" }}><strong>Target namespace:</strong></dt>
              <dd>{submittedObject.spec?.targetNamespace}</dd>
              {observedObject?.status?.phase && (
                <>
                  <dt style={{ marginTop: "0.5rem" }}><strong>Phase:</strong></dt>
                  <dd>{observedObject.status.phase}</dd>
                </>
              )}
            </dl>
          </>
        )}

        <div style={{ marginBottom: "2rem" }}>
          <Title headingLevel="h2">Component readiness</Title>
          <ComponentReadinessTable status={observedObject?.status} draft={draft} />
        </div>

        <Button
          variant="primary"
          onClick={() => {
            if (onComplete) onComplete();
          }}
          isDisabled={postSubmitState !== "reconciled"}
        >
          Continue to workflows
        </Button>
      </PageSection>
    );
  }

  return (
    <PageSection>
      <Title headingLevel="h1">Review and submit platform configuration</Title>

      <div style={{ marginTop: "2rem", marginBottom: "2rem" }}>
        <ResourceEditor<ClusterLogicPlatformCRSpec, ClusterLogicPlatformCRStatus>
          transport={kubernetes}
          ref={{
            gvk: { group: LOGIC_GROUP, version: LOGIC_VERSION, kind: LogicKinds.ClusterLogicPlatform },
            name: seed.metadata.name,
          }}
          seed={seed}
          verb={editMode ? "update" : "create"}
          deployed={editMode ? existingPlatform ?? undefined : undefined}
          onWriteSuccess={handleWriteSuccess}
          onWriteError={handleWriteError}
        />
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <Title headingLevel="h2">Component configuration preview</Title>
        <ComponentReadinessTable status={null} draft={draft} />
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <Button variant="secondary" onClick={onCancel}>
          Cancel setup
        </Button>
      </div>
    </PageSection>
  );
};

function ComponentReadinessTable({
  status,
  draft,
}: {
  readonly status: ClusterLogicPlatformCRStatus | null | undefined;
  readonly draft: PlatformSetupDraft;
}): ReactNode {
  // If status is provided, show operator readiness
  // Otherwise show configuration preview
  const hasStatus = status !== null && status !== undefined;

  type ComponentStatus = "ready" | "pending" | "failed" | "configured" | "skipped";

  interface Component {
    name: string;
    enabled: boolean;
    status: ComponentStatus;
    description: string;
    reason?: string;
  }

  const getComponentStatus = (
    componentName: "dataIndex" | "vector" | "gateway",
  ): { status: ComponentStatus; description: string; reason?: string } => {
    if (!hasStatus) {
      // Preview mode - show configured/pending based on draft
      if (componentName === "dataIndex" && draft.executionMode === "history-enabled") {
        return {
          status: "configured",
          description: `PostgreSQL: ${draft.dataIndex?.postgresqlServiceName || "(service required)"}`,
        };
      }
      if (componentName === "vector" && draft.executionMode === "history-enabled") {
        return {
          status: "configured",
          description: `Watch namespace: ${draft.vector?.watchNamespaces?.[0] || draft.targetNamespace}`,
        };
      }
      if (componentName === "gateway" && draft.gatewayIngress.enabled) {
        return {
          status: "configured",
          description: `Ingress: ${draft.gatewayIngress.host || "(hostname required)"}`,
        };
      }
      return { status: "skipped", description: "Not enabled" };
    }

    // Operator status mode
    const componentStatus = status[componentName];
    if (!componentStatus) {
      return { status: "skipped", description: "Not enabled" };
    }

    const ready = componentStatus.ready;
    if (ready) {
      return { status: "ready", description: "Ready" };
    }

    // Check conditions for reason
    const conditions = status.conditions || [];
    const componentCondition = conditions.find(
      (c) => c.type.toLowerCase().includes(componentName.toLowerCase()),
    );

    return {
      status: status.phase === "Failed" ? "failed" : "pending",
      description: componentCondition?.status === "False" ? "Not ready" : "Pending",
      reason: componentCondition?.reason || componentCondition?.message,
    };
  };

  const persistence = draft.runtimePersistence;
  const runtime = persistence?.runtime?.postgresql;
  const quartz = persistence?.quartz?.postgresql;
  const complete = (store: typeof runtime) => Boolean(store?.secretRef?.name && store.serviceRef?.name);
  const runtimeRow: Component = {
    name: "Runtime persistence",
    enabled: !!persistence,
    status: !persistence ? "skipped" : complete(runtime) && (!quartz || complete(quartz)) ? "configured" : "pending",
    description: persistence
      ? `Runtime schema: ${runtime?.serviceRef?.databaseSchema || "Database default"}. Quartz: ${quartz ? quartz.serviceRef?.databaseSchema || "Database default" : "shares the runtime datasource"}.`
      : "Runtime persistence disabled",
  };

  const components: Component[] = [
    {
      name: "Target Namespace",
      enabled: true,
      status: hasStatus ? "ready" : (draft.targetNamespace ? "configured" : "pending"),
      description: draft.targetNamespace || "Waiting for namespace selection",
    },
    ...(!hasStatus ? [runtimeRow] : []),
    ...(draft.gatewayIngress.enabled || (hasStatus && status.gateway)
      ? [
          {
            name: "Workflow Gateway",
            enabled: true,
            ...getComponentStatus("gateway"),
          },
        ]
      : []),
    ...(draft.executionMode === "history-enabled" || (hasStatus && status.dataIndex)
      ? [
          {
            name: "Data Index",
            enabled: true,
            ...getComponentStatus("dataIndex"),
          },
          {
            name: "Vector Logging",
            enabled: true,
            ...getComponentStatus("vector"),
          },
        ]
      : []),
  ];

  return (
    <Table aria-label="Component readiness">
      <Thead>
        <Tr>
          <Th>Component</Th>
          <Th>Status</Th>
          <Th>Details</Th>
        </Tr>
      </Thead>
      <Tbody>
        {components.map((comp) => (
          <Tr key={comp.name}>
            <Td>{comp.name}</Td>
            <Td>
              {comp.status === "ready" && (
                <>
                  <CheckCircleIcon style={{ color: "green", marginRight: "0.5rem" }} />
                  Ready
                </>
              )}
              {comp.status === "configured" && (
                <>
                  <CheckCircleIcon style={{ color: "green", marginRight: "0.5rem" }} />
                  Configured
                </>
              )}
              {comp.status === "pending" && (
                <>
                  <ClockIcon style={{ color: "orange", marginRight: "0.5rem" }} />
                  Pending
                </>
              )}
              {comp.status === "failed" && (
                <>
                  <ExclamationCircleIcon style={{ color: "red", marginRight: "0.5rem" }} />
                  Failed
                </>
              )}
              {comp.status === "skipped" && (
                <>
                  <ExclamationCircleIcon style={{ color: "blue", marginRight: "0.5rem" }} />
                  Skipped
                </>
              )}
            </Td>
            <Td>
              {comp.description}
              {comp.reason && (
                <div style={{ marginTop: "0.25rem", fontSize: "0.9em", color: "#6a6e73" }}>
                  {comp.reason}
                </div>
              )}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
