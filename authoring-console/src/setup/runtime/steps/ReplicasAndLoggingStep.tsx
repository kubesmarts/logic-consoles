/**
 * Replicas and structured logging configuration step.
 */
import { type ReactNode, useCallback } from "react";
import {
  PageSection,
  Title,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  TextInput,
  Checkbox,
  Alert,
} from "@patternfly/react-core";
import type { RuntimeSetupDraft } from "../types.ts";

interface ReplicasAndLoggingStepProps {
  readonly draft: RuntimeSetupDraft;
  readonly onChange: (updates: Partial<RuntimeSetupDraft>) => void;
  readonly vectorWatchNamespaces?: readonly string[];
}

export const ReplicasAndLoggingStep = ({
  draft,
  onChange,
  vectorWatchNamespaces,
}: ReplicasAndLoggingStepProps): ReactNode => {
  const handleReplicasChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, value: string) => {
      const num = parseInt(value, 10);
      onChange({ replicas: isNaN(num) ? undefined : num });
    },
    [onChange],
  );

  const handleLoggingEnabledChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, checked: boolean) => {
      onChange({
        structuredLogging: {
          ...draft.structuredLogging,
          enabled: checked,
        },
      });
    },
    [onChange, draft.structuredLogging],
  );

  const handleWorkflowPayloadsChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, checked: boolean) => {
      onChange({
        structuredLogging: {
          ...draft.structuredLogging,
          enabled: draft.structuredLogging?.enabled ?? true,
          includeWorkflowPayloads: checked,
        },
      });
    },
    [onChange, draft.structuredLogging],
  );

  const handleTaskPayloadsChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, checked: boolean) => {
      onChange({
        structuredLogging: {
          ...draft.structuredLogging,
          enabled: draft.structuredLogging?.enabled ?? true,
          includeTaskPayloads: checked,
        },
      });
    },
    [onChange, draft.structuredLogging],
  );

  // Check if runtime will be outside Vector's watched namespaces
  const isOutsideVectorWatch =
    vectorWatchNamespaces &&
    vectorWatchNamespaces.length > 0 &&
    !vectorWatchNamespaces.includes(draft.namespace);

  return (
    <PageSection style={{ maxWidth: "50rem" }}>
      <Title headingLevel="h1">Replicas and logging</Title>
      <div style={{ marginTop: "1rem", marginBottom: "2rem" }}>
        <p>
          Configure the number of runtime replicas and structured logging for workflow events.
        </p>
      </div>

      <Form>
        <FormGroup
          label="Replicas"
          fieldId="replicas"
        >
          <TextInput
            id="replicas"
            type="number"
            value={draft.replicas?.toString() || ""}
            onChange={handleReplicasChange}
            aria-label="Number of replicas"
            placeholder="1"
            min={0}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Number of runtime pod replicas (leave empty for operator default)</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        <FormGroup
          label="Structured logging"
          fieldId="structured-logging"
        >
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Enable JSON structured logging for workflow events (required for Vector/history)</HelperTextItem>
            </HelperText>
          </FormHelperText>
          <Checkbox
            id="logging-enabled"
            label="Enable structured JSON logging"
            isChecked={draft.structuredLogging?.enabled ?? false}
            onChange={handleLoggingEnabledChange}
          />
          {draft.structuredLogging?.enabled && (
            <>
              <Checkbox
                id="logging-workflow-payloads"
                label="Include workflow input/output payloads"
                description="WARNING: Enable only if you can store payloads securely (sensitive data)"
                isChecked={draft.structuredLogging.includeWorkflowPayloads ?? false}
                onChange={handleWorkflowPayloadsChange}
                style={{ marginTop: "0.5rem", marginLeft: "1.5rem" }}
              />
              <Checkbox
                id="logging-task-payloads"
                label="Include task input/output payloads"
                description="WARNING: Sensitive data protection required"
                isChecked={draft.structuredLogging.includeTaskPayloads ?? false}
                onChange={handleTaskPayloadsChange}
                style={{ marginTop: "0.5rem", marginLeft: "1.5rem" }}
              />
            </>
          )}
        </FormGroup>

        {isOutsideVectorWatch && (
          <Alert
            variant="warning"
            title="Vector watch namespace warning"
            isInline
            style={{ marginTop: "1.5rem" }}
          >
            This runtime will run OUTSIDE Vector's watched namespaces (
            {vectorWatchNamespaces.join(", ")}). Workflow history will not be indexed for it.
            To enable history indexing, deploy the runtime to one of the watched namespaces or
            update the platform Vector configuration.
          </Alert>
        )}

        {draft.structuredLogging?.enabled && (
          <Alert
            variant="info"
            title="Structured logging dependency"
            isInline
            style={{ marginTop: "1.5rem" }}
          >
            Structured logging requires Vector to be configured in the ClusterLogicPlatform to
            capture and index workflow events for history queries.
          </Alert>
        )}
      </Form>
    </PageSection>
  );
};
