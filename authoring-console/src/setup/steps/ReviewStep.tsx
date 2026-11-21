/**
 * Review + dry-run + submit step (Deliverable 7).
 * Shows readiness for each enabled component.
 * Note: ResourceEditor integration via C will be integrated once the editor API is stabilized.
 */
import { type ReactNode } from "react";
import { Form, Button, Alert, Title, AlertVariant, CodeBlock, CodeBlockCode } from "@patternfly/react-core";
import { Table, Thead, Tbody, Tr, Th, Td } from "@patternfly/react-table";
import { CheckCircleIcon, ClockIcon } from "@patternfly/react-icons"; // eslint-disable-line
import type { PlatformSetupDraft } from "../types.ts";
import { buildPlatformCR } from "../buildPlatformCR.ts";

interface ReviewStepProps {
  readonly draft: PlatformSetupDraft;
  readonly onComplete?: () => void;
  readonly onCancel?: () => void;
}

export const ReviewStep = ({ draft, onComplete, onCancel }: ReviewStepProps): ReactNode => {
  // Build the CR from draft
  const platformCR = buildPlatformCR(draft);
  const crYaml = JSON.stringify(platformCR, null, 2);

  return (
    <Form>
      <div style={{ marginBottom: "1.5rem" }}>
        <Title headingLevel="h2">Review configuration</Title>
        <CodeBlock style={{ marginTop: "1rem" }}>
          <CodeBlockCode>{crYaml}</CodeBlockCode>
        </CodeBlock>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <Title headingLevel="h2">Component readiness</Title>
        <ComponentReadiness draft={draft} />
      </div>

      <div style={{ marginBottom: "1.5rem", display: "flex", gap: "1rem" }}>
        <Button variant="primary" onClick={onCancel}>
          Back
        </Button>
        <Button variant="primary" onClick={onComplete}>
          Complete
        </Button>
      </div>

      <Alert isInline variant={AlertVariant.info} title="Next steps">
        Platform CR review and submission through the ResourceEditor will be completed via integration with C's shared editor component.
        Deployment readiness status updates will appear here after submission.
      </Alert>
    </Form>
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
    },
    {
      name: "Workflow Gateway",
      enabled: draft.gatewayIngress.enabled,
      status: "configured",
    },
    ...(draft.executionMode === "history-enabled"
      ? [
          {
            name: "Data Index",
            enabled: true,
            status: "configured",
          },
          {
            name: "Vector Logging",
            enabled: true,
            status: "configured",
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
          <Th>Message</Th>
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
                  <ClockIcon style={{ color: "blue", marginRight: "0.5rem" }} />
                  Pending
                </>
              )}
            </Td>
            <Td>
              {!comp.enabled && "Not configured for this mode"}
              {comp.enabled && comp.status === "configured" && "Specified in configuration"}
              {comp.enabled && comp.status === "pending" && "Awaiting submission"}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
