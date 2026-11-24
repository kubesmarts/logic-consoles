/**
 * Runtimes page (Packet D2 deliverable): lists LogicFlowRuntime objects in the active namespace.
 * Displays: name, persistence mode, ready replicas, status.
 * Actions: Create new runtime, view details, view YAML.
 * Allows entering a namespace when listing is forbidden (403).
 */
import { type ReactNode, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Bullseye,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateBody,
  Form,
  FormGroup,
  Modal,
  ModalBody,
  ModalHeader,
  ModalVariant,
  PageSection,
  Spinner,
  TextInput,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from "@patternfly/react-core";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
import { stringify } from "yaml";
import { YamlEditor } from "../../editors/YamlEditor.tsx";
import { NamespaceBar } from "../shell/NamespaceBar.tsx";
import { useConsole } from "../ConsoleContext.tsx";
import {
  DEFAULT_PERSISTENCE_MODE,
  LOGIC_GROUP,
  LOGIC_VERSION,
  LogicKinds,
  type LogicFlowRuntimeSpec,
  type KubeObject,
} from "../../contracts/index.ts";
import { RuntimeSetupWizard } from "../../setup/runtime/RuntimeSetupWizard.tsx";

interface RuntimeStatus {
  readonly readyReplicas?: number;
  readonly replicas?: number;
  readonly phase?: string;
  readonly conditions?: ReadonlyArray<{
    readonly type: string;
    readonly status: string;
    readonly reason?: string;
  }>;
}

export const RuntimesPage = (): ReactNode => {
  const { session, kubernetes, capabilities } = useConsole();
  const defaultNamespace = session.namespace ?? "default";
  const [customNamespace, setCustomNamespace] = useState("");
  const [targetNamespace, setTargetNamespace] = useState(defaultNamespace);
  const [editing, setEditing] = useState<KubeObject<LogicFlowRuntimeSpec, RuntimeStatus>>();
  const updateAccess = useQuery({
    queryKey: [session.sessionId, targetNamespace, "update-runtime"],
    queryFn: ({signal}) => capabilities.canI({group: LOGIC_GROUP, resource: "logicflowruntimes", verb: "update", namespace: targetNamespace}, signal),
  });
  const [showWizard, setShowWizard] = useState(false);
  const [selectedRuntime, setSelectedRuntime] = useState<KubeObject<
    LogicFlowRuntimeSpec,
    RuntimeStatus
  > | null>(null);
  const [showYaml, setShowYaml] = useState(false);

  const query = useQuery({
    queryKey: [session.sessionId, session.context.contextName, "runtimes", targetNamespace],
    queryFn: ({ signal }) =>
      kubernetes.list<LogicFlowRuntimeSpec, RuntimeStatus>(
        { group: LOGIC_GROUP, version: LOGIC_VERSION, kind: LogicKinds.LogicFlowRuntime },
        { namespace: targetNamespace },
        signal,
      ),
  });

  const isForbidden = query.isError &&
    query.error &&
    typeof query.error === "object" &&
    "statusCode" in query.error &&
    query.error.statusCode === 403;

  const handleCustomNamespaceChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, value: string) => {
      setCustomNamespace(value);
    },
    [],
  );

  const handleLoadNamespace = useCallback(() => {
    if (customNamespace.trim()) {
      setTargetNamespace(customNamespace.trim());
    }
  }, [customNamespace]);

  const handleCreateClick = (): void => {
    setEditing(undefined);
    setShowWizard(true);
  };

  const handleWizardComplete = (): void => {
    setShowWizard(false);
    query.refetch();
  };

  const handleWizardCancel = (): void => {
    setShowWizard(false);
  };

  const handleViewDetails = (runtime: KubeObject<LogicFlowRuntimeSpec, RuntimeStatus>): void => {
    setSelectedRuntime(runtime);
  };

  const handleViewYaml = (runtime: KubeObject<LogicFlowRuntimeSpec, RuntimeStatus>): void => {
    setSelectedRuntime(runtime);
    setShowYaml(true);
  };

  const handleCloseDetails = (): void => {
    setSelectedRuntime(null);
    setShowYaml(false);
  };

  return (
    <>
      <NamespaceBar />
      <PageSection>
        <Title headingLevel="h1">Runtimes</Title>
      </PageSection>
      <PageSection>
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <Button variant="primary" onClick={handleCreateClick}>
                Create runtime
              </Button>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>

        {isForbidden && (
          <Alert
            variant="warning"
            title="Namespace listing forbidden"
            isInline
            style={{ marginBottom: "1rem" }}
          >
            You do not have permission to list runtimes in this namespace. Enter a specific namespace below to load its runtimes.
          </Alert>
        )}

        <Form style={{ marginBottom: "1.5rem", maxWidth: "40rem" }}>
          <FormGroup
            label="Load runtimes from namespace"
            fieldId="custom-namespace"
          >
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <TextInput
                id="custom-namespace"
                type="text"
                value={customNamespace}
                onChange={handleCustomNamespaceChange}
                aria-label="Namespace name"
                placeholder={targetNamespace}
              />
              <Button variant="secondary" onClick={handleLoadNamespace} isDisabled={!customNamespace.trim()}>
                Load
              </Button>
            </div>
          </FormGroup>
        </Form>

        {query.isPending ? (
          <Bullseye>
            <Spinner aria-label="Loading runtimes" />
          </Bullseye>
        ) : query.isError && !isForbidden ? (
          <EmptyState titleText="Runtimes unavailable" headingLevel="h2" status="danger">
            <EmptyStateBody>
              {query.error instanceof Error ? query.error.message : "Runtimes could not be read."}
            </EmptyStateBody>
          </EmptyState>
        ) : query.data && query.data.items.length > 0 ? (
          <Table aria-label="Runtimes" variant="compact">
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Persistence mode</Th>
                <Th>Ready replicas</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {query.data.items.map((runtime) => {
                const status = runtime.status;
                const readyReplicas = status?.readyReplicas ?? 0;
                const totalReplicas = status?.replicas ?? 0;
                const phase = status?.phase ?? "Unknown";

                return (
                  <Tr key={runtime.metadata.name}>
                    <Td dataLabel="Name">{runtime.metadata.name}</Td>
                    <Td dataLabel="Persistence mode">
                      {runtime.spec?.persistenceMode ?? DEFAULT_PERSISTENCE_MODE}
                    </Td>
                    <Td dataLabel="Ready replicas">
                      {readyReplicas} / {totalReplicas}
                    </Td>
                    <Td dataLabel="Status">{phase}</Td>
                    <Td dataLabel="Actions">
                      {updateAccess.data?.decision === "allowed" && <Button variant="link" onClick={() => { setEditing(runtime); setShowWizard(true); }}>Edit persistence</Button>}
                      <Button variant="link" onClick={() => handleViewDetails(runtime)}>
                        Details
                      </Button>
                      {" | "}
                      <Button variant="link" onClick={() => handleViewYaml(runtime)}>
                        YAML
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        ) : (
          <EmptyState titleText="No runtimes" headingLevel="h2">
            <EmptyStateBody>
              No runtimes exist in this namespace. Create one to execute workflows.
            </EmptyStateBody>
          </EmptyState>
        )}
      </PageSection>

      {/* Create runtime wizard modal */}
      <Modal
        variant={ModalVariant.large}
        isOpen={showWizard}
        onClose={handleWizardCancel}
        aria-labelledby="runtime-wizard-title"
      >
        <ModalHeader labelId="runtime-wizard-title" title={editing ? "Edit runtime persistence" : "Create runtime"} />
        <ModalBody>
          <RuntimeSetupWizard key={editing?.metadata.uid ?? editing?.metadata.name ?? "create"} editing={editing} onComplete={handleWizardComplete} onCancel={handleWizardCancel} />
        </ModalBody>
      </Modal>

      {selectedRuntime && (
        <Modal
          variant={showYaml ? ModalVariant.large : ModalVariant.medium}
          isOpen
          onClose={handleCloseDetails}
          aria-labelledby="runtime-dialog-title"
        >
          <ModalHeader
            labelId="runtime-dialog-title"
            title={`${showYaml ? "Runtime YAML" : "Runtime details"} — ${selectedRuntime.metadata.name}`}
          />
          <ModalBody>
            {showYaml ? (
              <YamlEditor
                ariaLabel={`YAML for runtime ${selectedRuntime.metadata.name}`}
                value={stringify(selectedRuntime, { lineWidth: 0 })}
                height="min(60vh, 40rem)"
                foldManagedFields
              />
            ) : (
              <DescriptionList isHorizontal>
                {[
                  ["Name", selectedRuntime.metadata.name],
                  ["Namespace", selectedRuntime.metadata.namespace],
                  ["Persistence mode", selectedRuntime.spec?.persistenceMode ?? DEFAULT_PERSISTENCE_MODE],
                  ["Ready replicas", `${selectedRuntime.status?.readyReplicas ?? 0} / ${selectedRuntime.status?.replicas ?? 0}`],
                  ["Status", selectedRuntime.status?.phase ?? "Unknown"],
                ].map(([label, value]) => (
                  <DescriptionListGroup key={label}>
                    <DescriptionListTerm>{label}</DescriptionListTerm>
                    <DescriptionListDescription>{value}</DescriptionListDescription>
                  </DescriptionListGroup>
                ))}
                {!!selectedRuntime.status?.conditions?.length && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Conditions</DescriptionListTerm>
                    <DescriptionListDescription>
                      {selectedRuntime.status.conditions.map(cond => (
                        <div key={cond.type}>
                          {cond.type}: {cond.status}{cond.reason && ` (${cond.reason})`}
                        </div>
                      ))}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}
              </DescriptionList>
            )}
          </ModalBody>
        </Modal>
      )}
    </>
  );
};
