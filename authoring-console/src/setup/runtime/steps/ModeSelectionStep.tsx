/**
 * Mode selection step: select existing runtime OR create new.
 * A restricted author (no create permission) can still select an existing runtime.
 */
import { type ReactNode, useCallback } from "react";
import {
  PageSection,
  Title,
  Form,
  FormGroup,
  Radio,
  FormSelect,
  FormSelectOption,
  Alert,
} from "@patternfly/react-core";
import type { RuntimeSetupDraft } from "../types.ts";
import type { KubeObject, LogicFlowRuntimeSpec } from "../../../contracts/index.ts";

interface ModeSelectionStepProps {
  readonly draft: RuntimeSetupDraft;
  readonly onChange: (updates: Partial<RuntimeSetupDraft>) => void;
  readonly existingRuntimes: readonly KubeObject<LogicFlowRuntimeSpec>[];
  readonly canCreate: boolean;
}

export const ModeSelectionStep = ({
  draft,
  onChange,
  existingRuntimes,
  canCreate,
}: ModeSelectionStepProps): ReactNode => {
  const handleRuntimeSelection = useCallback(
    (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
      onChange({ selectedRuntimeName: value });
    },
    [onChange],
  );

  return (
    <PageSection style={{ maxWidth: "50rem" }}>
      <Title headingLevel="h1">Select or create runtime</Title>
      <div style={{ marginTop: "1rem", marginBottom: "2rem" }}>
        <p>
          Choose an existing runtime in this namespace, or create a new one to execute workflows.
        </p>
      </div>

      {!canCreate && (
        <Alert
          variant="warning"
          title="Limited permissions"
          isInline
          style={{ marginBottom: "1.5rem" }}
        >
          You can select an existing runtime but do not have permission to create new runtimes.
        </Alert>
      )}

      <Form>
        <FormGroup
          label="Runtime mode"
          isRequired
          fieldId="runtime-mode"
        >
          {existingRuntimes.length > 0 && (
            <Radio
              id="mode-select"
              name="runtime-mode"
              label="Use existing runtime"
              isChecked={draft.mode === "select-existing"}
              onChange={() => onChange({ mode: "select-existing" })}
            />
          )}
          <Radio
            id="mode-create"
            name="runtime-mode"
            label="Create new runtime"
            isChecked={draft.mode === "create-new"}
            onChange={() => onChange({ mode: "create-new" })}
            isDisabled={!canCreate}
          />
        </FormGroup>

        {draft.mode === "select-existing" && existingRuntimes.length > 0 && (
          <FormGroup
            label="Select runtime"
            isRequired
            fieldId="select-runtime"
          >
            <FormSelect
              id="select-runtime"
              value={draft.selectedRuntimeName || ""}
              onChange={handleRuntimeSelection}
              aria-label="Select existing runtime"
            >
              <FormSelectOption value="" label="Choose a runtime" isPlaceholder />
              {existingRuntimes.map((runtime) => (
                <FormSelectOption
                  key={runtime.metadata.name}
                  value={runtime.metadata.name}
                  label={runtime.metadata.name}
                />
              ))}
            </FormSelect>
          </FormGroup>
        )}

        {draft.mode === "select-existing" && existingRuntimes.length === 0 && (
          <Alert
            variant="info"
            title="No existing runtimes"
            isInline
            style={{ marginTop: "1rem" }}
          >
            No runtimes exist in this namespace. Create a new one to continue.
          </Alert>
        )}
      </Form>
    </PageSection>
  );
};
