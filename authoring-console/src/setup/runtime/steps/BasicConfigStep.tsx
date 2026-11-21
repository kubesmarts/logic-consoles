/**
 * Basic runtime configuration: name, namespace, platformRef, persistence mode.
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
  FormSelect,
  FormSelectOption,
  Radio,
  Alert,
} from "@patternfly/react-core";
import type { RuntimeSetupDraft } from "../types.ts";

interface BasicConfigStepProps {
  readonly draft: RuntimeSetupDraft;
  readonly onChange: (updates: Partial<RuntimeSetupDraft>) => void;
  readonly platformName?: string;
  readonly activeNamespace: string;
}

export const BasicConfigStep = ({
  draft,
  onChange,
  platformName,
  activeNamespace,
}: BasicConfigStepProps): ReactNode => {
  const handleNameChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, value: string) => {
      onChange({ name: value });
    },
    [onChange],
  );

  const handleNamespaceChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, value: string) => {
      onChange({ namespace: value });
    },
    [onChange],
  );

  const handlePlatformRefChange = useCallback(
    (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
      onChange({ platformRef: value || undefined });
    },
    [onChange],
  );

  return (
    <PageSection style={{ maxWidth: "50rem" }}>
      <Title headingLevel="h1">Configure runtime</Title>
      <div style={{ marginTop: "1rem", marginBottom: "2rem" }}>
        <p>
          Set the basic runtime configuration including name, namespace, platform reference, and persistence mode.
        </p>
      </div>

      <Form>
        <FormGroup
          label="Runtime name"
          isRequired
          fieldId="runtime-name"
        >
          <TextInput
            id="runtime-name"
            type="text"
            value={draft.name}
            onChange={handleNameChange}
            aria-label="Runtime name"
            placeholder="my-runtime"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Kubernetes resource name for this runtime</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        <FormGroup
          label="Namespace"
          isRequired
          fieldId="runtime-namespace"
        >
          <TextInput
            id="runtime-namespace"
            type="text"
            value={draft.namespace}
            onChange={handleNamespaceChange}
            aria-label="Runtime namespace"
            placeholder={activeNamespace}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Namespace where the runtime will be created</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        <FormGroup
          label="Platform reference"
          fieldId="platform-ref"
        >
          <FormSelect
            id="platform-ref"
            value={draft.platformRef || ""}
            onChange={handlePlatformRefChange}
            aria-label="Platform reference"
          >
            <FormSelectOption value="" label="No platform reference" />
            {platformName && (
              <FormSelectOption value={platformName} label={platformName} />
            )}
          </FormSelect>
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Optional reference to the ClusterLogicPlatform</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        <FormGroup
          label="Persistence mode"
          isRequired
          fieldId="persistence-mode"
        >
          <Radio
            id="persistence-ephemeral"
            name="persistence-mode"
            label="Ephemeral (in-memory, no persistence)"
            description="Workflows run in memory. Restart loses state. Good for development."
            isChecked={draft.persistenceMode === "Ephemeral"}
            onChange={() => onChange({ persistenceMode: "Ephemeral" })}
          />
          <Radio
            id="persistence-platformdb"
            name="persistence-mode"
            label="PlatformDB (persistent storage)"
            description="Workflows persist to the platform database. Requires platform DB configuration."
            isChecked={draft.persistenceMode === "PlatformDB"}
            onChange={() => onChange({ persistenceMode: "PlatformDB" })}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Workflow execution persistence strategy</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        {draft.persistenceMode === "PlatformDB" && (
          <Alert
            variant="info"
            title="PlatformDB dependency"
            isInline
            style={{ marginTop: "1rem" }}
          >
            PlatformDB persistence requires the platform database to be configured in the ClusterLogicPlatform.
            Ensure the platform database is available before deploying this runtime.
          </Alert>
        )}
      </Form>
    </PageSection>
  );
};
