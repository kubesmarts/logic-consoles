/**
 * Vector configuration step (Deliverable 5).
 * Data Index enabled + one watched runtime namespace for this baseline.
 * Keep sensitive payload logging opt-in.
 */
import { type ReactNode } from "react";
import {
  Form,
  FormGroup,
  TextInput,
  Checkbox,
  Alert,
  Content,
  AlertVariant,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from "@patternfly/react-core";
import type { PlatformSetupDraft, VectorConfig } from "../types.ts";

interface VectorStepProps {
  readonly draft: PlatformSetupDraft;
  readonly onUpdate: (updates: Partial<PlatformSetupDraft>) => void;
}

export const VectorStep = ({ draft, onUpdate }: VectorStepProps): ReactNode => {
  const vector = draft.vector || {
    watchNamespaces: [draft.targetNamespace],
    debugEvents: false,
  };

  const handleUpdate = (updates: Partial<VectorConfig>): void => {
    onUpdate({
      vector: { ...vector, ...updates },
    });
  };

  return (
    <Form style={{ maxWidth: "600px" }}>
      <Alert isInline variant={AlertVariant.info} title="Vector log forwarding">
        Collects structured logs from workflow runtimes and Data Index for observability.
      </Alert>

      <div style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
        <Content component="h3" style={{ marginBottom: "1rem" }}>
          Watched namespaces
        </Content>
        <FormGroup label="Runtime namespace" fieldId="watch-ns">
          <TextInput
            value={vector.watchNamespaces?.[0] || draft.targetNamespace}
            onChange={(_event, value) => handleUpdate({ watchNamespaces: [value] })}
            placeholder={draft.targetNamespace}
            id="watch-ns"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Vector watches this namespace for runtime logs. Typically the target namespace.</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <Content component="h3" style={{ marginBottom: "1rem" }}>
          Logging configuration
        </Content>
        <FormGroup fieldId="debug-events">
          <Checkbox
            id="debug-events"
            label="Enable debug event logging"
            isChecked={vector.debugEvents || false}
            onChange={(_event, checked) => handleUpdate({ debugEvents: checked })}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>
                Logs all workflow events to stdout. WARNING: At 1000 events/sec generates ~43 GB/day. Only enable for
                troubleshooting.
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </div>

      <Alert isInline variant={AlertVariant.warning} title="Requires structured logging">
        Runtimes must support structured logging for Vector to collect events. This is part of LogicFlow runtime configuration.
      </Alert>
    </Form>
  );
};
