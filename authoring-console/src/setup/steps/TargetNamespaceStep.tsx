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
  ModalFooter,
  Tabs,
  Tab,
  TabTitleText,
  FormHelperText,
  HelperText,
  HelperTextItem,
  AlertVariant,
} from "@patternfly/react-core";
import { ExclamationTriangleIcon } from "@patternfly/react-icons";
import { useConsole } from "../../app/ConsoleContext.tsx";
import { useResourceEditor } from "../../resource-editor/index.ts";
import type { PlatformSetupDraft } from "../types.ts";

interface TargetNamespaceStepProps {
  readonly draft: PlatformSetupDraft;
  readonly onUpdate: (updates: Partial<PlatformSetupDraft>) => void;
  readonly canCreateNamespace: boolean;
}

export const TargetNamespaceStep = ({
  draft,
  onUpdate,
  canCreateNamespace,
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
        { gvk: { group: "", version: "v1", kind: "Namespace" } },
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

  const resourceEditor = useResourceEditor({
    transport: kubernetes,
    ref: {
      gvk: { group: "", version: "v1", kind: "Namespace" },
      name: newNamespaceName,
      namespace: "",
    },
    seed: namespaceTemplate,
    verb: "create",
  });

  const handleCreateNamespace = async (): Promise<void> => {
    if (!newNamespaceName.trim()) {
      setCreateError("Namespace name is required");
      return;
    }
    setCreateError(null);
    try {
      await resourceEditor.dryRun();
      onUpdate({ targetNamespace: newNamespaceName });
      setShowCreateModal(false);
      setNewNamespaceName("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create namespace");
    }
  };

  return (
    <Form>
      <div style={{ marginBottom: "1.5rem" }}>
        <FormGroup label="Select namespace" isRequired fieldId="namespace-select">
          {canCreateNamespace && (
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
          {!canCreateNamespace && (
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
        variant={ModalVariant.medium}
        onClose={() => setShowCreateModal(false)}
      >
        <ModalHeader title="Create namespace" />
        <ModalBody>
          <Form>
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
            {createError && (
              <Alert isInline variant={AlertVariant.danger} title={createError} />
            )}
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button key="cancel" variant="secondary" onClick={() => setShowCreateModal(false)}>
            Cancel
          </Button>
          <Button
            key="create"
            variant="primary"
            onClick={handleCreateNamespace}
            isDisabled={!newNamespaceName.trim()}
          >
            Create
          </Button>
        </ModalFooter>
      </Modal>
    </Form>
  );
};
