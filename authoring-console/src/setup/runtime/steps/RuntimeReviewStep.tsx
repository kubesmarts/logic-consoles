/**
 * Runtime review + dry-run + submit step (Deliverable 6).
 * Uses ResourceEditor (from C) for full-CR review/dry-run/submit.
 * Shows ready replicas, conditions via reconciliation state.
 */
import { type ReactNode, useState, useCallback, useRef } from "react";
import {
  PageSection,
  Title,
  Button,
  EmptyState,
  EmptyStateBody,
  Alert,
  Spinner,
} from "@patternfly/react-core";
import { Table, Thead, Tbody, Tr, Th, Td } from "@patternfly/react-table";
import { CheckCircleIcon, ClockIcon, ExclamationCircleIcon } from "@patternfly/react-icons";
import { useConsole } from "../../../app/ConsoleContext.tsx";
import { ResourceEditor } from "../../../resource-editor/ResourceEditor.tsx";
import { useResourceEditor } from "../../../resource-editor/useResourceEditor.ts";
import { LOGIC_GROUP, LOGIC_VERSION, LogicKinds, type KubeObject } from "../../../contracts/index.ts";
import type { RuntimeSetupDraft } from "../types.ts";
import {
  buildRuntimeCR,
  type LogicFlowRuntimeCRSpec,
  type LogicFlowRuntimeCRStatus,
} from "../buildRuntimeCR.ts";

interface RuntimeReviewStepProps {
  readonly draft: RuntimeSetupDraft;
  readonly onComplete?: () => void;
  readonly onCancel?: () => void;
  readonly editMode?: boolean;
  readonly selectExistingMode?: boolean;
  readonly existingRuntime?: KubeObject<LogicFlowRuntimeCRSpec, LogicFlowRuntimeCRStatus> | null;
}

type PostSubmitState = "ready" | "submitted" | "reconciling" | "reconciled" | "error";

export const RuntimeReviewStep = ({
  draft,
  onComplete,
  onCancel,
  editMode = false,
  selectExistingMode = false,
  existingRuntime,
}: RuntimeReviewStepProps): ReactNode => {
  const { kubernetes } = useConsole();
  const [postSubmitState, setPostSubmitState] = useState<PostSubmitState>("ready");
  const [submittedObject, setSubmittedObject] = useState<KubeObject<
    LogicFlowRuntimeCRSpec,
    LogicFlowRuntimeCRStatus
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // SELECT-EXISTING MODE: Read-only view, no ResourceEditor/create
  if (selectExistingMode && existingRuntime) {
    return (
      <PageSection>
        <Title headingLevel="h1">Confirm runtime selection</Title>
        <div style={{ marginTop: "1rem", marginBottom: "2rem" }}>
          <p>
            You have selected an existing runtime. Review the details below and click Continue to proceed.
          </p>
        </div>

        <dl style={{ marginBottom: "2rem" }}>
          <dt>
            <strong>Runtime name:</strong>
          </dt>
          <dd>{existingRuntime.metadata.name}</dd>
          <dt style={{ marginTop: "0.5rem" }}>
            <strong>Namespace:</strong>
          </dt>
          <dd>{existingRuntime.metadata.namespace}</dd>
          <dt style={{ marginTop: "0.5rem" }}>
            <strong>Persistence mode:</strong>
          </dt>
          <dd>{existingRuntime.spec?.persistenceMode || "Ephemeral"}</dd>
          {existingRuntime.status?.readyReplicas !== undefined && (
            <>
              <dt style={{ marginTop: "0.5rem" }}>
                <strong>Ready replicas:</strong>
              </dt>
              <dd>
                {existingRuntime.status.readyReplicas} / {existingRuntime.status.replicas || 0}
              </dd>
            </>
          )}
          {existingRuntime.status?.phase && (
            <>
              <dt style={{ marginTop: "0.5rem" }}>
                <strong>Status:</strong>
              </dt>
              <dd>{existingRuntime.status.phase}</dd>
            </>
          )}
        </dl>

        <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
          <Button variant="primary" onClick={onComplete}>
            Continue
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </PageSection>
    );
  }

  // CREATE MODE: Build the CR from draft
  const runtimeCR = buildRuntimeCR(draft);

  // In edit mode, merge with existing runtime to preserve resourceVersion and other fields
  const seed =
    editMode && existingRuntime
      ? {
          ...existingRuntime,
          spec: runtimeCR.spec,
        }
      : runtimeCR;

  // Use ResourceEditor hook for reconciliation tracking (CREATE mode only)
  const editorController = useResourceEditor<LogicFlowRuntimeCRSpec, LogicFlowRuntimeCRStatus>({
    transport: kubernetes,
    ref: {
      gvk: { group: LOGIC_GROUP, version: LOGIC_VERSION, kind: LogicKinds.LogicFlowRuntime },
      name: draft.name,
      namespace: draft.namespace,
    },
    seed,
    verb: editMode ? "update" : "create",
    deployed: editMode ? existingRuntime ?? undefined : undefined,
  });

  const handleWriteSuccess = useCallback(
    (result: KubeObject<LogicFlowRuntimeCRSpec, LogicFlowRuntimeCRStatus>) => {
      setSubmittedObject(result);
      setPostSubmitState("submitted");
      setError(null);

      // Start reconciliation tracking using C's API
      if (!abortControllerRef.current) {
        abortControllerRef.current = new AbortController();
      }
      editorController.startReconciliation(result, abortControllerRef.current.signal);
    },
    [editorController],
  );

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
      submitted: "Runtime submitted",
      reconciling: "Runtime reconciling",
      reconciled: "Runtime ready",
      error: "Submission failed",
      ready: "",
    };

    const stateDescriptions = {
      submitted: "The LogicFlowRuntime has been submitted. Waiting for operator to process it.",
      reconciling: "The operator is processing the runtime configuration.",
      reconciled: "The runtime has been reconciled and is ready.",
      error: "Failed to submit the runtime. Please check the error below.",
      ready: "",
    };

    if (postSubmitState === "error") {
      return (
        <PageSection>
          <EmptyState titleText={stateMessages.error} headingLevel="h2" status="danger">
            <EmptyStateBody>
              <div>{stateDescriptions.error}</div>
              <div
                style={{
                  marginTop: "1rem",
                  padding: "1rem",
                  backgroundColor: "#f5f5f5",
                  borderRadius: "4px",
                }}
              >
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
          {postSubmitState === "submitted" || postSubmitState === "reconciling" ? (
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
              <dt>
                <strong>Runtime name:</strong>
              </dt>
              <dd>{submittedObject.metadata.name}</dd>
              <dt style={{ marginTop: "0.5rem" }}>
                <strong>Namespace:</strong>
              </dt>
              <dd>{submittedObject.metadata.namespace}</dd>
              <dt style={{ marginTop: "0.5rem" }}>
                <strong>Persistence mode:</strong>
              </dt>
              <dd>{submittedObject.spec?.persistenceMode || "Ephemeral"}</dd>
              {observedObject?.status?.phase && (
                <>
                  <dt style={{ marginTop: "0.5rem" }}>
                    <strong>Phase:</strong>
                  </dt>
                  <dd>{observedObject.status.phase}</dd>
                </>
              )}
              {observedObject?.status?.readyReplicas !== undefined && (
                <>
                  <dt style={{ marginTop: "0.5rem" }}>
                    <strong>Ready replicas:</strong>
                  </dt>
                  <dd>
                    {observedObject.status.readyReplicas} / {observedObject.status.replicas || 0}
                  </dd>
                </>
              )}
            </dl>
          </>
        )}

        <div style={{ marginBottom: "2rem" }}>
          <Title headingLevel="h2">Runtime readiness</Title>
          <RuntimeReadinessTable status={observedObject?.status} draft={draft} />
        </div>

        <Button
          variant="primary"
          onClick={() => {
            if (onComplete) onComplete();
          }}
          isDisabled={postSubmitState !== "reconciled"}
        >
          Continue
        </Button>
      </PageSection>
    );
  }

  return (
    <PageSection>
      <Title headingLevel="h1">Review and submit runtime configuration</Title>

      <div style={{ marginTop: "2rem", marginBottom: "2rem" }}>
        <ResourceEditor<LogicFlowRuntimeCRSpec, LogicFlowRuntimeCRStatus>
          transport={kubernetes}
          ref={{
            gvk: { group: LOGIC_GROUP, version: LOGIC_VERSION, kind: LogicKinds.LogicFlowRuntime },
            name: draft.name,
            namespace: draft.namespace,
          }}
          seed={seed}
          verb={editMode ? "update" : "create"}
          deployed={editMode ? existingRuntime ?? undefined : undefined}
          onWriteSuccess={handleWriteSuccess}
          onWriteError={handleWriteError}
        />
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <Title headingLevel="h2">Configuration preview</Title>
        <RuntimeReadinessTable status={null} draft={draft} />
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </PageSection>
  );
};

function RuntimeReadinessTable({
  status,
  draft,
}: {
  readonly status: LogicFlowRuntimeCRStatus | null | undefined;
  readonly draft: RuntimeSetupDraft;
}): ReactNode {
  // If status is provided, show operator readiness
  // Otherwise show configuration preview
  const hasStatus = status !== null && status !== undefined;

  type ComponentStatus = "ready" | "pending" | "failed" | "configured";

  interface Component {
    name: string;
    status: ComponentStatus;
    description: string;
    reason?: string;
  }

  const baseComponents: Component[] = [
    {
      name: "Runtime name",
      status: hasStatus ? "ready" : draft.name ? "configured" : "pending",
      description: draft.name || "Waiting for name",
    },
    {
      name: "Namespace",
      status: hasStatus ? "ready" : draft.namespace ? "configured" : "pending",
      description: draft.namespace || "Waiting for namespace",
    },
    {
      name: "Persistence mode",
      status: hasStatus ? "ready" : "configured",
      description: draft.persistenceMode,
    },
    ...(draft.replicas !== undefined && draft.replicas > 0
      ? [
          {
            name: "Replicas",
            status: (hasStatus ? "ready" : "configured") as ComponentStatus,
            description: hasStatus
              ? `${status.readyReplicas || 0} / ${status.replicas || 0} ready`
              : `${draft.replicas} configured`,
          },
        ]
      : []),
    ...(draft.structuredLogging?.enabled
      ? [
          {
            name: "Structured logging",
            status: (hasStatus ? "ready" : "configured") as ComponentStatus,
            description: "Enabled",
          },
        ]
      : []),
    ...(draft.security && draft.security.type !== "NONE"
      ? [
          {
            name: "Security",
            status: (hasStatus ? "ready" : "configured") as ComponentStatus,
            description: draft.security.type,
          },
        ]
      : []),
  ];

  // Add status-driven failures if present (map to new array instead of mutating)
  const components = hasStatus && status && status.phase === "Failed"
    ? (() => {
        const readyCondition = status.conditions?.find((c) => c.type === "Ready");
        if (readyCondition && readyCondition.status === "False") {
          return baseComponents.map((comp) =>
            comp.name === "Runtime name"
              ? {
                  ...comp,
                  status: "failed" as ComponentStatus,
                  reason: readyCondition.reason || readyCondition.message,
                }
              : comp
          );
        }
        return baseComponents;
      })()
    : baseComponents;

  return (
    <Table aria-label="Runtime readiness">
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
