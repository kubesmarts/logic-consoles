/**
 * Execution mode choice step (Deliverable 3).
 * - Quick run without history (gateway + ephemeral runtime)
 * - Run a workflow and see its history (Data Index + Vector)
 */
import { type ReactNode } from "react";
import { Form, FormGroup, Radio, Content } from "@patternfly/react-core";
import type { PlatformSetupDraft, ExecutionMode } from "../types.ts";

interface ExecutionModeStepProps {
  readonly draft: PlatformSetupDraft;
  readonly onUpdate: (updates: Partial<PlatformSetupDraft>) => void;
}

export const ExecutionModeStep = ({ draft, onUpdate }: ExecutionModeStepProps): ReactNode => (
  <Form>
    <FormGroup label="Choose execution mode" fieldId="execution-mode" isRequired>
      <div style={{ marginBottom: "1.5rem" }}>
        <Radio
          id="history-enabled"
          name="execution-mode"
          label="Run a workflow and see its history"
          description="Configure Data Index and Vector for workflow instance tracking and observability"
          isChecked={draft.executionMode === "history-enabled"}
          onChange={() => onUpdate({ executionMode: "history-enabled" as ExecutionMode })}
        />
        <Content component="small" style={{ marginLeft: "2rem", marginTop: "0.5rem" }}>
          History-enabled mode configures PostgreSQL Data Index and Vector logging. Requires PostgreSQL deployment
          and schema management.
        </Content>
      </div>

      <div>
        <Radio
          id="quick-run"
          name="execution-mode"
          label="Quick run without history"
          description="Gateway-only with ephemeral runtime; no history or logging"
          isChecked={draft.executionMode === "quick-run"}
          onChange={() => onUpdate({ executionMode: "quick-run" as ExecutionMode })}
        />
        <Content component="small" style={{ marginLeft: "2rem", marginTop: "0.5rem" }}>
          Quick-run uses the workflow gateway with an ephemeral runtime. Workflow output is displayed immediately.
          No instance history or structured logging.
        </Content>
      </div>
    </FormGroup>
  </Form>
);
