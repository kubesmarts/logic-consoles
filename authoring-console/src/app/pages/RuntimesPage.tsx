/**
 * Runtimes page (Packet D2 deliverable): lists LogicFlowRuntime objects in the active namespace.
 * Displays: name, persistence mode, ready replicas, status.
 * Actions: Create new runtime, view details, view YAML.
 */
import { type ReactNode, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bullseye,
  Button,
  EmptyState,
  EmptyStateBody,
  Modal,
  ModalVariant,
  PageSection,
  Spinner,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from "@patternfly/react-core";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
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
  const { session, kubernetes } = useConsole();
  const namespace = session.namespace ?? "default";
  const [showWizard, setShowWizard] = useState(false);
  const [selectedRuntime, setSelectedRuntime] = useState<KubeObject<
    LogicFlowRuntimeSpec,
    RuntimeStatus
  > | null>(null);
  const [showYaml, setShowYaml] = useState(false);

  const query = useQuery({
    queryKey: [session.sessionId, session.context.contextName, "runtimes", namespace],
    queryFn: ({ signal }) =>
      kubernetes.list<LogicFlowRuntimeSpec, RuntimeStatus>(
        { group: LOGIC_GROUP, version: LOGIC_VERSION, kind: LogicKinds.LogicFlowRuntime },
        { namespace },
        signal,
      ),
  });

  const handleCreateClick = (): void => {
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

        {query.isPending ? (
          <Bullseye>
            <Spinner aria-label="Loading runtimes" />
          </Bullseye>
        ) : query.isError ? (
          <EmptyState titleText="Runtimes unavailable" headingLevel="h2" status="danger">
            <EmptyStateBody>Runtimes could not be read.</EmptyStateBody>
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
        aria-label="Create runtime wizard"
      >
        <RuntimeSetupWizard onComplete={handleWizardComplete} onCancel={handleWizardCancel} />
      </Modal>

      {/* Details modal */}
      {selectedRuntime && !showYaml && (
        <Modal
          variant={ModalVariant.medium}
          title={`Runtime: ${selectedRuntime.metadata.name}`}
          isOpen={true}
          onClose={handleCloseDetails}
          aria-label="Runtime details"
        >
          <dl>
            <dt>
              <strong>Name:</strong>
            </dt>
            <dd>{selectedRuntime.metadata.name}</dd>
            <dt style={{ marginTop: "0.5rem" }}>
              <strong>Namespace:</strong>
            </dt>
            <dd>{selectedRuntime.metadata.namespace}</dd>
            <dt style={{ marginTop: "0.5rem" }}>
              <strong>Persistence mode:</strong>
            </dt>
            <dd>{selectedRuntime.spec?.persistenceMode ?? DEFAULT_PERSISTENCE_MODE}</dd>
            <dt style={{ marginTop: "0.5rem" }}>
              <strong>Ready replicas:</strong>
            </dt>
            <dd>
              {selectedRuntime.status?.readyReplicas ?? 0} / {selectedRuntime.status?.replicas ?? 0}
            </dd>
            <dt style={{ marginTop: "0.5rem" }}>
              <strong>Status:</strong>
            </dt>
            <dd>{selectedRuntime.status?.phase ?? "Unknown"}</dd>
            {selectedRuntime.status?.conditions && selectedRuntime.status.conditions.length > 0 && (
              <>
                <dt style={{ marginTop: "0.5rem" }}>
                  <strong>Conditions:</strong>
                </dt>
                <dd>
                  {selectedRuntime.status.conditions.map((cond, idx) => (
                    <div key={idx} style={{ marginTop: "0.25rem" }}>
                      {cond.type}: {cond.status}
                      {cond.reason && ` (${cond.reason})`}
                    </div>
                  ))}
                </dd>
              </>
            )}
          </dl>
        </Modal>
      )}

      {/* YAML modal */}
      {selectedRuntime && showYaml && (
        <Modal
          variant={ModalVariant.large}
          title={`Runtime YAML: ${selectedRuntime.metadata.name}`}
          isOpen={true}
          onClose={handleCloseDetails}
          aria-label="Runtime YAML"
        >
          <pre
            style={{
              backgroundColor: "#f5f5f5",
              padding: "1rem",
              borderRadius: "4px",
              overflow: "auto",
              maxHeight: "60vh",
            }}
          >
            {JSON.stringify(selectedRuntime, null, 2)}
          </pre>
        </Modal>
      )}
    </>
  );
};
