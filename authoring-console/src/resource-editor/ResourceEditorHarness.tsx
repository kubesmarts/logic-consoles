/**
 * Resource editor harness — minimal proof that the editor works.
 *
 * NOT part of the public interface (D/E don't import this). Just a demo/test page
 * to verify the editor against fixture transports.
 */
import { type ReactNode, useState } from "react";
import {
  Page,
  PageSection,
  Title,
  Form,
  FormGroup,
  TextInput,
  Alert,
  AlertVariant,
} from "@patternfly/react-core";
import type { KubeObject, ResourceRef } from "../contracts/index.ts";
import { createFixtureKubernetesTransport } from "../fixtures/transports/kubernetes.ts";
import { ResourceEditor } from "./ResourceEditor.tsx";
import type { UseResourceEditorResult } from "./useResourceEditor.ts";

const namespaceSeed: KubeObject = {
  apiVersion: "v1",
  kind: "Namespace",
  metadata: { name: "demo-namespace" },
};

const namespaceRef: ResourceRef = {
  gvk: { group: "", version: "v1", kind: "Namespace" },
  name: "demo-namespace",
};

export const ResourceEditorHarness = (): ReactNode => {
  const [transport] = useState(() => createFixtureKubernetesTransport());
  const [writeResult, setWriteResult] = useState<KubeObject | null>(null);
  const [dryRunResult, setDryRunResult] = useState<KubeObject | null>(null);

  const renderNamespaceForm = (controller: UseResourceEditorResult): ReactNode => {
    const name = controller.state.draft.object?.metadata.name ?? "";

    return (
      <Form>
        <FormGroup label="Name" isRequired>
          <TextInput
            value={name}
            onChange={(_, value) =>
              controller.updateFields([{ path: "metadata.name", value }])
            }
            aria-label="Namespace name"
          />
        </FormGroup>
      </Form>
    );
  };

  return (
    <Page>
      <PageSection>
        <Title headingLevel="h1">Resource Editor Harness</Title>
        <p>
          This is a minimal harness to prove the resource editor works against fixture
          transports. Packets D and E will consume the public interface.
        </p>
      </PageSection>

      <PageSection>
        {writeResult && (
          <Alert
            variant={AlertVariant.success}
            title="Write succeeded"
            isInline
            style={{ marginBottom: "1rem" }}
          >
            Created {writeResult.kind} {writeResult.metadata.name}
          </Alert>
        )}
        {dryRunResult && (
          <Alert
            variant={AlertVariant.info}
            title="Dry-run succeeded"
            isInline
            style={{ marginBottom: "1rem" }}
          >
            Admitted {dryRunResult.kind} {dryRunResult.metadata.name}
          </Alert>
        )}

        <ResourceEditor
          transport={transport}
          ref={namespaceRef}
          seed={namespaceSeed}
          verb="create"
          renderForm={renderNamespaceForm}
          onWriteSuccess={setWriteResult}
          onDryRunSuccess={setDryRunResult}
        />
      </PageSection>
    </Page>
  );
};
