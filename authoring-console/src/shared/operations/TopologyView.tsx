/**
 * Topology view component (read-only). Renders a cluster topology with:
 * - Graph/List switch with same selection behavior
 * - Definition selection drawer showing identity + status + link to version
 * - Distinct error states: 503 (index-pending), 502 (upstream), 403 (denied), unreachable
 * - Partial graph support (shows available nodes + warnings)
 *
 * Injected transport and navigation so it can be reused by the Operational Console.
 */
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Bullseye,
  Button,
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerContentBody,
  DrawerHead,
  DrawerPanelContent,
  EmptyState,
  EmptyStateBody,
  Label,
  PageSection,
  Spinner,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from "@patternfly/react-core";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
import type { GatewayTransport, TopologyNode, TopologyGraph } from "../../contracts/index.ts";
import { TopologyCanvas } from "../../editors/TopologyCanvas.tsx";
import type { NavigationPort } from "../../contracts/index.ts";

export interface TopologyViewProps {
  readonly namespace: string;
  readonly gateway: GatewayTransport;
  readonly navigation: NavigationPort;
  /**
   * Optional Run action slot for Packet G. When provided, renders the Run UI
   * in the definition drawer, exposing the selected deployed version and its links.
   */
  readonly renderRunAction?: (version: TopologyNode) => ReactNode;
}

interface TopologyViewState {
  readonly selectedNodeId: string | null;
  readonly showList: boolean;
  readonly retrying: boolean;
}

export const TopologyView = ({ namespace, gateway, navigation, renderRunAction }: TopologyViewProps): ReactNode => {
  const [viewState, setViewState] = useState<TopologyViewState>({
    selectedNodeId: null,
    showList: false,
    retrying: false,
  });

  const query = useQuery({
    queryKey: [namespace, "topology"],
    queryFn: ({ signal }) => gateway.getTopology(namespace, signal),
  });

  const handleRetry = (): void => {
    setViewState((s) => ({ ...s, retrying: true }));
    query.refetch().finally(() => {
      setViewState((s) => ({ ...s, retrying: false }));
    });
  };

  const handleNodeSelect = (nodeId: string): void => {
    setViewState((s) => ({ ...s, selectedNodeId: nodeId }));
  };

  const handleDrawerClose = (): void => {
    setViewState((s) => ({ ...s, selectedNodeId: null }));
  };

  const selectedNode =
    query.data && viewState.selectedNodeId
      ? query.data.nodes.find((n) => n.id === viewState.selectedNodeId)
      : null;

  return (
    <>
      {query.isPending ? (
        <PageSection>
          <Bullseye>
            <Spinner aria-label="Loading topology" />
          </Bullseye>
        </PageSection>
      ) : query.isError ? (
        <PageSection>
          <TopologyErrorState error={query.error} onRetry={handleRetry} retrying={viewState.retrying} />
        </PageSection>
      ) : query.data ? (
        <>
          {query.data.discovery.partial && (
            <PageSection>
              <Alert variant="warning" isInline title="Partial topology">
                Some sources could not be read. Showing available nodes.
                {query.data.discovery.warnings.length > 0 && (
                  <ul style={{ marginTop: "0.5rem" }}>
                    {query.data.discovery.warnings.map((w) => (
                      <li key={`${w.kind}-${w.nodeId}`}>
                        {w.kind}
                        {w.nodeId && ` (${w.nodeId})`}: {w.code}
                      </li>
                    ))}
                  </ul>
                )}
              </Alert>
            </PageSection>
          )}
          <PageSection>
            <Title headingLevel="h2">Topology</Title>
            <Toolbar>
              <ToolbarContent>
                <ToolbarItem>
                  <Button
                    variant={viewState.showList ? "primary" : "secondary"}
                    onClick={() => setViewState((s) => ({ ...s, showList: !s.showList }))}
                  >
                    {viewState.showList ? "Show graph" : "Show list"}
                  </Button>
                </ToolbarItem>
              </ToolbarContent>
            </Toolbar>
          </PageSection>
          <PageSection>
            {viewState.showList ? (
              <TopologyListView nodes={query.data.nodes} onNodeSelect={handleNodeSelect} selectedNodeId={viewState.selectedNodeId} />
            ) : (
              <TopologyGraphView graph={query.data} onNodeSelect={handleNodeSelect} />
            )}
          </PageSection>
          {selectedNode && (
            <Drawer
              isExpanded={selectedNode !== null}
              onExpand={() => {}}
              position="right"
            >
              <DrawerContent panelContent={<DefinitionDrawer node={selectedNode} onClose={handleDrawerClose} navigation={navigation} renderRunAction={renderRunAction} />}>
                <DrawerContentBody>{/* Main content goes here */}</DrawerContentBody>
              </DrawerContent>
            </Drawer>
          )}
        </>
      ) : null}
    </>
  );
};

interface TopologyGraphViewProps {
  readonly graph: TopologyGraph;
  readonly onNodeSelect: (nodeId: string) => void;
}

const TopologyGraphView = ({ graph, onNodeSelect }: TopologyGraphViewProps): ReactNode => {
  return <TopologyCanvas graph={graph} onNodeSelect={onNodeSelect} />;
};

interface TopologyListViewProps {
  readonly nodes: readonly TopologyNode[];
  readonly onNodeSelect: (nodeId: string) => void;
  readonly selectedNodeId: string | null;
}

const TopologyListView = ({ nodes, onNodeSelect, selectedNodeId }: TopologyListViewProps): ReactNode => {
  return (
    <Table aria-label="Topology nodes" variant="compact">
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Kind</Th>
          <Th>Namespace</Th>
          <Th>Status</Th>
          <Th>Source</Th>
        </Tr>
      </Thead>
      <Tbody>
        {nodes.map((node) => (
          <Tr
            key={node.id}
            selected={node.id === selectedNodeId}
            onRowClick={() => onNodeSelect(node.id)}
            style={{ cursor: "pointer" }}
          >
            <Td dataLabel="Name">{node.label}</Td>
            <Td dataLabel="Kind">{node.kind}</Td>
            <Td dataLabel="Namespace">{node.namespace ?? "-"}</Td>
            <Td dataLabel="Status">{node.status.state}</Td>
            <Td dataLabel="Source">{node.status.source}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};

interface DefinitionDrawerProps {
  readonly node: TopologyNode;
  readonly onClose: () => void;
  readonly navigation: NavigationPort;
  readonly renderRunAction?: (version: TopologyNode) => ReactNode;
}

const DefinitionDrawer = ({ node, onClose, navigation, renderRunAction }: DefinitionDrawerProps): ReactNode => {
  if (node.kind !== "LogicFlowDefinition" || !node.namespace || !node.details) {
    return (
      <DrawerPanelContent isResizable>
        <DrawerHead>
          <span>{node.label}</span>
          <DrawerCloseButton onClick={onClose} />
        </DrawerHead>
      </DrawerPanelContent>
    );
  }

  const version = (node.details as Record<string, unknown>)?.version as string;
  const workflowName = node.name;
  const ns = node.namespace ?? "";

  const handleViewVersion = (): void => {
    navigation.navigate(
      `/workflows/${encodeURIComponent(ns)}/${encodeURIComponent(workflowName)}/${encodeURIComponent(version)}`
    );
    onClose();
  };

  return (
    <DrawerPanelContent isResizable>
      <DrawerHead>
        <span>{node.label}</span>
        <DrawerCloseButton onClick={onClose} />
      </DrawerHead>
      <DrawerContentBody>
        <div style={{ padding: "1rem" }}>
          <h3 style={{ marginBottom: "1rem" }}>Definition Details</h3>
          <Table aria-label="Definition details" variant="compact">
            <Tbody>
              <Tr>
                <Td dataLabel="Workflow name">{workflowName}</Td>
              </Tr>
              <Tr>
                <Td dataLabel="Version">
                  <Label>{version}</Label>
                </Td>
              </Tr>
              <Tr>
                <Td dataLabel="Namespace">{node.namespace}</Td>
              </Tr>
              <Tr>
                <Td dataLabel="Status">{node.status.state}</Td>
              </Tr>
            </Tbody>
          </Table>
          <Button onClick={handleViewVersion} variant="primary" style={{ marginTop: "1.5rem" }}>
            View deployed version
          </Button>
          {renderRunAction && (
            <div style={{ marginTop: "1rem" }}>
              {renderRunAction(node)}
            </div>
          )}
        </div>
      </DrawerContentBody>
    </DrawerPanelContent>
  );
};

interface TopologyErrorStateProps {
  readonly error: Error | null;
  readonly onRetry: () => void;
  readonly retrying: boolean;
}

const TopologyErrorState = ({ error, onRetry, retrying }: TopologyErrorStateProps): ReactNode => {
  if (!error) {
    return null;
  }

  // Type guard to check if it's a GatewayError
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isGatewayError = (err: unknown): err is any => {
    return !!(err && typeof err === "object" && "kind" in err);
  };

  const gatewayError = isGatewayError(error) ? (error as { kind?: string; detail?: string }) : null;

  if (gatewayError?.kind === "index-pending") {
    return (
      <EmptyState titleText="Topology discovery pending" headingLevel="h2" status="warning">
        <EmptyStateBody>
          The topology index is still being built. Try again in a moment.
        </EmptyStateBody>
        <Button onClick={onRetry} isLoading={retrying}>
          Retry
        </Button>
      </EmptyState>
    );
  }

  if (gatewayError?.kind === "unreachable") {
    return (
      <EmptyState titleText="Gateway unreachable" headingLevel="h2" status="danger">
        <EmptyStateBody>
          The workflow gateway could not be reached. Kubernetes actions remain available.
        </EmptyStateBody>
        <Button onClick={onRetry} isLoading={retrying}>
          Retry
        </Button>
      </EmptyState>
    );
  }

  if (gatewayError?.kind === "upstream-error") {
    return (
      <EmptyState titleText="Gateway error" headingLevel="h2" status="danger">
        <EmptyStateBody>
          An upstream service failed. Kubernetes actions remain available.
        </EmptyStateBody>
        <Button onClick={onRetry} isLoading={retrying}>
          Retry
        </Button>
      </EmptyState>
    );
  }

  if (gatewayError?.kind === "denied") {
    return (
      <EmptyState titleText="Access denied" headingLevel="h2" status="danger">
        <EmptyStateBody>
          You do not have permission to view the topology. Kubernetes actions remain available.
        </EmptyStateBody>
      </EmptyState>
    );
  }

  return (
    <EmptyState titleText="Topology unavailable" headingLevel="h2" status="warning">
      <EmptyStateBody>The gateway could not return topology. Kubernetes actions remain available.</EmptyStateBody>
      <Button onClick={onRetry} isLoading={retrying}>
        Retry
      </Button>
    </EmptyState>
  );
};
