/**
 * Review + dry-run + submit step (Deliverable 7).
 * Uses ResourceEditor (from C) for full-CR review/dry-run/submit.
 * Shows per-component readiness via reconciliation state.
 */
import { type ReactNode, useState, useCallback } from "react";
import { PageSection, Title, Button, EmptyState, EmptyStateBody } from "@patternfly/react-core";
import { Table, Thead, Tbody, Tr, Th, Td } from "@patternfly/react-table";
import { CheckCircleIcon, ClockIcon, ExclamationCircleIcon } from "@patternfly/react-icons";
import { useConsole } from "../../app/ConsoleContext.tsx";
import { ResourceEditor } from "../../resource-editor/ResourceEditor.tsx";
import { LOGIC_GROUP, LOGIC_VERSION, LogicKinds, type KubeObject } from "../../contracts/index.ts";
import type { PlatformSetupDraft } from "../types.ts";
import { buildPlatformCR, type ClusterLogicPlatformCRSpec, type ClusterLogicPlatformCRStatus } from "../buildPlatformCR.ts";

interface ReviewStepProps {
  readonly draft: PlatformSetupDraft;
  readonly onComplete?: () => void;
  readonly onCancel?: () => void;
}

type PostSubmitState = "ready" | "submitted" | "error";

export const ReviewStep = ({ draft, onComplete, onCancel }: ReviewStepProps): ReactNode => {
  const { kubernetes } = useConsole();
  const [postSubmitState, setPostSubmitState] = useState<PostSubmitState>("ready");
  const [submittedObject, setSubmittedObject] = useState<KubeObject<ClusterLogicPlatformCRSpec, ClusterLogicPlatformCRStatus> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Build the CR from draft
  const platformCR = buildPlatformCR(draft);

  const handleWriteSuccess = useCallback((result: KubeObject<ClusterLogicPlatformCRSpec, ClusterLogicPlatformCRStatus>) => {
    setSubmittedObject(result);
    setPostSubmitState("submitted");
    setError(null);
  }, []);

  const handleWriteError = useCallback((err: unknown) => {
    setError(String(err));
    setPostSubmitState("error");
  }, []);

  // If submitted, show readiness screen
  if (postSubmitState !== "ready") {
    const stateMessages = {
      submitted: "Platform submitted",
      error: "Submission failed",
      ready: "",
    };

    const stateDescriptions = {
      submitted: "The ClusterLogicPlatform has been submitted. The operator is now processing it.",
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
        <EmptyState titleText={stateMessages[postSubmitState]} headingLevel="h2" status="success">
          <EmptyStateBody>
            <p>{stateDescriptions[postSubmitState]}</p>
            {submittedObject && (
              <>
                <p style={{ marginTop: "1rem" }}>
                  <strong>Platform name:</strong> {submittedObject.metadata.name}
                </p>
                <p>
                  <strong>Target namespace:</strong> {submittedObject.spec?.targetNamespace}
                </p>
              </>
            )}
          </EmptyStateBody>
          <Button
            variant="primary"
            onClick={() => {
              if (onComplete) onComplete();
            }}
          >
            Continue to workflows
          </Button>
        </EmptyState>

        <div style={{ marginTop: "2rem" }}>
          <Title headingLevel="h2">Component readiness</Title>
          <ComponentReadiness draft={draft} />
        </div>
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
            name: "cluster-platform",
            namespace: "",
          }}
          seed={platformCR}
          verb="create"
          onWriteSuccess={handleWriteSuccess}
          onWriteError={handleWriteError}
        />
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <Title headingLevel="h2">Component readiness preview</Title>
        <ComponentReadiness draft={draft} />
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <Button variant="secondary" onClick={onCancel}>
          Cancel setup
        </Button>
      </div>
    </PageSection>
  );
};

function ComponentReadiness({
  draft,
}: {
  readonly draft: PlatformSetupDraft;
}): ReactNode {
  const components = [
    {
      name: "Target Namespace",
      enabled: true,
      status: draft.targetNamespace ? "configured" : "pending",
      description: draft.targetNamespace || "Waiting for namespace selection",
    },
    {
      name: "Workflow Gateway",
      enabled: draft.gatewayIngress.enabled,
      status: draft.gatewayIngress.enabled ? "configured" : "skipped",
      description: draft.gatewayIngress.enabled ? `Ingress: ${draft.gatewayIngress.host || "(hostname required)"}` : "Gateway ingress disabled",
    },
    ...(draft.executionMode === "history-enabled"
      ? [
          {
            name: "Data Index",
            enabled: true,
            status: "configured" as const,
            description: `PostgreSQL: ${draft.dataIndex?.postgresqlServiceName || "(service required)"}`,
          },
          {
            name: "Vector Logging",
            enabled: true,
            status: "configured" as const,
            description: `Watch namespace: ${draft.vector?.watchNamespaces?.[0] || draft.targetNamespace}`,
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
              {comp.status === "skipped" && (
                <>
                  <ExclamationCircleIcon style={{ color: "blue", marginRight: "0.5rem" }} />
                  Skipped
                </>
              )}
            </Td>
            <Td>{comp.description}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
