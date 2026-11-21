/**
 * Target namespace selection step (Deliverable 2).
 * - Select existing namespace
 * - Or create new namespace via editable YAML + dry-run + submit
 */
import { type ReactNode, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Form,
  FormGroup,
  TextInput,
  Alert,
  Button,
  Modal,
  ModalVariant,
  ModalBody,
  ModalHeader,
  Tabs,
  Tab,
  TabTitleText,
  FormHelperText,
  HelperText,
  HelperTextItem,
  AlertVariant,
  CodeBlock,
  CodeBlockCode,
} from "@patternfly/react-core";
import { ExclamationTriangleIcon } from "@patternfly/react-icons";
import { useConsole } from "../../app/ConsoleContext.tsx";
import { ResourceEditor } from "../../resource-editor/ResourceEditor.tsx";
import type { PlatformSetupDraft } from "../types.ts";

interface TargetNamespaceStepProps {
  readonly draft: PlatformSetupDraft;
  readonly onUpdate: (updates: Partial<PlatformSetupDraft>) => void;
  readonly canCreateNamespace: boolean;
  readonly editMode?: boolean;
}

export const TargetNamespaceStep = ({
  draft,
  onUpdate,
  canCreateNamespace,
  editMode = false,
}: TargetNamespaceStepProps): ReactNode => {
  const { kubernetes } = useConsole();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newNamespaceName, setNewNamespaceName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // List available namespaces
  const namespacesQuery = useQuery({
    queryKey: ["namespaces"],
    queryFn: ({ signal }) =>
      kubernetes.list(
        { group: "", version: "v1", kind: "Namespace" },
        {},
        signal,
      ).then((res: unknown) => {
        // Extract namespace names from response
        if (res && typeof res === "object" && "items" in res) {
          return (res.items as Array<{ metadata?: { name?: string } }>)
            .map((item) => item.metadata?.name)
            .filter((name): name is string => !!name)
            .sort();
        }
        return [];
      }),
  });

  const namespaces = namespacesQuery.data ?? [];

  // Create namespace draft
  const namespaceTemplate = {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
      name: newNamespaceName,
      labels: {},
      annotations: {},
    },
  };

  const handleNamespaceCreated = (created: { metadata: { name?: string } }): void => {
    const createdName = created.metadata.name || newNamespaceName;
    onUpdate({ targetNamespace: createdName });
    setShowCreateModal(false);
    setNewNamespaceName("");
    setCreateError(null);
    // Refetch the namespace list
    void namespacesQuery.refetch();
  };

  const handleNamespaceCreateError = (err: unknown): void => {
    // Check if it's a forbidden error
    if (err && typeof err === "object" && "statusCode" in err && err.statusCode === 403) {
      setCreateError("forbidden");
    } else if (err && typeof err === "object" && "statusCode" in err && err.statusCode === 409) {
      // Namespace already exists - check if we can get it
      void kubernetes.get({ gvk: { group: "", version: "v1", kind: "Namespace" }, name: newNamespaceName, namespace: "" })
        .then(() => {
          // It exists and we can read it - offer to select it
          setCreateError("exists");
        })
        .catch(() => {
          // Exists but we can't read it
          setCreateError("exists-unknown");
        });
    } else {
      setCreateError(err instanceof Error ? err.message : "Failed to create namespace");
    }
  };

  const handleSelectExisting = (): void => {
    onUpdate({ targetNamespace: newNamespaceName });
    setShowCreateModal(false);
    setNewNamespaceName("");
    setCreateError(null);
  };

  return (
    <Form style={{ maxWidth: "600px" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <FormGroup label="Select namespace" isRequired fieldId="namespace-select">
          {editMode && (
            <>
              <TextInput
                value={draft.targetNamespace}
                readOnly
                id="namespace-input-readonly"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="warning" icon={<ExclamationTriangleIcon />}>
                    The target namespace is immutable after platform creation. To change it, delete the platform and create a new one.
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </>
          )}
          {!editMode && canCreateNamespace && (
            <div style={{ marginBottom: "1rem" }}>
              <Tabs activeKey={0}>
                <Tab eventKey={0} title={<TabTitleText>Select existing</TabTitleText>}>
                  <div style={{ padding: "1rem 0" }}>
                    {namespacesQuery.isPending ? (
                      "Loading namespaces..."
                    ) : namespaces.length > 0 ? (
                      <>
                        <TextInput
                          value={draft.targetNamespace}
                          onChange={(_event, value) => onUpdate({ targetNamespace: value })}
                          placeholder="Select or type namespace name"
                          id="namespace-input"
                          list="namespace-list"
                        />
                        <datalist id="namespace-list">
                          {namespaces.map((ns) => (
                            <option key={ns} value={ns} />
                          ))}
                        </datalist>
                      </>
                    ) : (
                      <Alert
                        isInline
                        variant={AlertVariant.info}
                        title="No namespaces available"
                      />
                    )}
                  </div>
                </Tab>
                <Tab eventKey={1} title={<TabTitleText>Create new</TabTitleText>}>
                  <div style={{ padding: "1rem 0" }}>
                    <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                      Create namespace
                    </Button>
                  </div>
                </Tab>
              </Tabs>
            </div>
          )}
          {!editMode && !canCreateNamespace && (
            <>
              <TextInput
                value={draft.targetNamespace}
                onChange={(_event, value) => onUpdate({ targetNamespace: value })}
                placeholder="Enter namespace name"
                id="namespace-input-readonly"
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="warning" icon={<ExclamationTriangleIcon />}>
                    You don't have permission to create namespaces. If the namespace doesn't exist, ask a cluster
                    administrator to create it with: kubectl create namespace &lt;name&gt;
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </>
          )}
          <FormHelperText>
            <HelperText>
              <HelperTextItem>The platform target namespace becomes immutable after platform creation</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </div>

      <Modal
        title="Create namespace"
        isOpen={showCreateModal}
        variant={ModalVariant.large}
        onClose={() => {
          setShowCreateModal(false);
          setCreateError(null);
        }}
      >
        <ModalHeader title="Create namespace" />
        <ModalBody>
          <FormGroup label="Namespace name" isRequired fieldId="new-ns-name">
            <TextInput
              value={newNamespaceName}
              onChange={(_event, value) => {
                setNewNamespaceName(value);
                setCreateError(null);
              }}
              placeholder="e.g. logic-platform"
              id="new-ns-name"
            />
          </FormGroup>

          {createError === "forbidden" && (
            <>
              <Alert isInline variant={AlertVariant.warning} title="Cannot create namespace">
                You don&apos;t have permission to create namespaces. Ask a cluster administrator to create it:
              </Alert>
              <CodeBlock style={{ marginTop: "1rem" }}>
                <CodeBlockCode>kubectl create namespace {newNamespaceName}</CodeBlockCode>
              </CodeBlock>
              <Button
                variant="primary"
                onClick={() => {
                  setCreateError(null);
                  void namespacesQuery.refetch();
                }}
                style={{ marginTop: "1rem" }}
              >
                Check again
              </Button>
            </>
          )}

          {createError === "exists" && (
            <>
              <Alert isInline variant={AlertVariant.info} title="Namespace already exists">
                The namespace &quot;{newNamespaceName}&quot; already exists. Would you like to select it?
              </Alert>
              <Button variant="primary" onClick={handleSelectExisting} style={{ marginTop: "1rem" }}>
                Select existing namespace
              </Button>
            </>
          )}

          {createError === "exists-unknown" && (
            <>
              <Alert isInline variant={AlertVariant.info} title="Namespace may already exist">
                The namespace &quot;{newNamespaceName}&quot; could not be created (conflict), but we cannot read it to verify. You can still select it by name.
              </Alert>
              <Button variant="primary" onClick={handleSelectExisting} style={{ marginTop: "1rem" }}>
                Select this name anyway
              </Button>
            </>
          )}

          {!createError && newNamespaceName.trim() && (
            <div style={{ marginTop: "1.5rem" }}>
              <ResourceEditor
                transport={kubernetes}
                ref={{
                  gvk: { group: "", version: "v1", kind: "Namespace" },
                  name: newNamespaceName,
                  namespace: "",
                }}
                seed={namespaceTemplate}
                verb="create"
                onWriteSuccess={handleNamespaceCreated}
                onWriteError={handleNamespaceCreateError}
              />
            </div>
          )}

          {typeof createError === "string" && createError !== "forbidden" && createError !== "exists" && createError !== "exists-unknown" && (
            <Alert isInline variant={AlertVariant.danger} title="Error">
              {createError}
            </Alert>
          )}
        </ModalBody>
      </Modal>
    </Form>
  );
};
