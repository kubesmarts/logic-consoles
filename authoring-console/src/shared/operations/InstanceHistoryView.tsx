/**
 * Instance history view component (read-only). Shows workflow instances for a specific
 * version with distinct error state handling:
 * - Empty history (successful, no rows)
 * - Pending indexing (accepted instance not yet indexed)
 * - Unavailable Data Index (503)
 * - Upstream error (502)
 * - Access denied (403)
 *
 * Open detail by id via getInstance. Restrict automatic retries to safe reads.
 */
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Bullseye,
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerContentBody,
  DrawerHead,
  DrawerPanelContent,
  EmptyState,
  EmptyStateBody,
  Spinner,
  TextInput,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from "@patternfly/react-core";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
import type { GatewayTransport, InstanceFilter, WorkflowVersionKey, WorkflowInstance } from "../../contracts/index.ts";
import type { UseQueryResult } from "@tanstack/react-query";

export interface InstanceHistoryViewProps {
  readonly versionKey: WorkflowVersionKey;
  readonly gateway: GatewayTransport;
  readonly sessionId?: string;
  readonly acceptedId?: string;
  readonly renderActions?: (instance: WorkflowInstance, refresh: () => void) => ReactNode;
}

interface InstanceHistoryState {
  readonly selectedInstanceId: string | null;
  readonly retrying: boolean;
}

export const InstanceHistoryView = ({ versionKey, gateway, sessionId, acceptedId, renderActions }: InstanceHistoryViewProps): ReactNode => {
  const [viewState, setViewState] = useState<InstanceHistoryState>({
    selectedInstanceId: acceptedId ?? null,
    retrying: false,
  });

  const [status, setStatus] = useState("");
  const filter: InstanceFilter = {
    namespace: versionKey.namespace,
    name: versionKey.workflowName,
    version: versionKey.version,
    ...(status && { status }),
  };

  const query = useQuery({
    queryKey: [sessionId, versionKey.namespace, versionKey.workflowName, versionKey.version, status, "instances"],
    queryFn: ({ signal }) => gateway.listInstances(filter, signal),
  });

  const detailQuery = useQuery({
    queryKey: [sessionId, versionKey.namespace, versionKey.workflowName, versionKey.version, viewState.selectedInstanceId, "instance-detail"],
    queryFn: ({ signal }) => gateway.getInstance(viewState.selectedInstanceId!, signal),
    enabled: !!viewState.selectedInstanceId,
  });

  const handleRetry = (): void => {
    setViewState((s) => ({ ...s, retrying: true }));
    Promise.all([query.refetch(), viewState.selectedInstanceId && detailQuery.refetch()]).finally(() => {
      setViewState((s) => ({ ...s, retrying: false }));
    });
  };

  const handleInstanceSelect = (instanceId: string): void => {
    setViewState((s) => ({ ...s, selectedInstanceId: instanceId }));
  };

  const handleDrawerClose = (): void => {
    setViewState((s) => ({ ...s, selectedInstanceId: null }));
  };

  return (
    <>
      <TextInput aria-label="Filter instances by status" placeholder="Filter by status" value={status}
        onChange={(_event, value) => setStatus(value)} />
      {acceptedId && query.isSuccess && !status && !query.data.some((row) => row.id === acceptedId) && (
        <p>Instance {acceptedId} was accepted and may still be waiting for indexing.
          <Button variant="link" onClick={handleRetry}>Retry history</Button>
        </p>
      )}
      {query.isPending ? (
        <Bullseye>
          <Spinner aria-label="Loading instance history" />
        </Bullseye>
      ) : query.isError ? (
        <InstanceHistoryErrorState error={query.error} onRetry={handleRetry} retrying={viewState.retrying} />
      ) : !query.data || query.data.length === 0 ? (
        <EmptyState titleText="No instances" headingLevel="h2">
          <EmptyStateBody>No executions have been indexed for this version.</EmptyStateBody>
        </EmptyState>
      ) : (
        <>
          <Toolbar>
            <ToolbarContent>
              <ToolbarItem>
                <span style={{ fontSize: "0.875rem", color: "var(--pf-v6-c-toolbar__content--Color)" }}>
                  {query.data.length} instance{query.data.length === 1 ? "" : "s"}
                </span>
              </ToolbarItem>
            </ToolbarContent>
          </Toolbar>
          <Table aria-label="Instance history" variant="compact">
            <Thead>
              <Tr>
                <Th>ID</Th>
                <Th>Status</Th>
                <Th>Started</Th>
                <Th>Ended</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {query.data.map((instance) => (
                <Tr key={instance.id}>
                  <Td dataLabel="ID">
                    <code>{instance.id}</code>
                  </Td>
                  <Td dataLabel="Status">{instance.status}</Td>
                  <Td dataLabel="Started">{instance.startedAt ?? "—"}</Td>
                  <Td dataLabel="Ended">{instance.endedAt ?? "—"}</Td>
                  <Td dataLabel="Actions">
                    <Button
                      variant="link"
                      onClick={() => handleInstanceSelect(instance.id)}
                      isInline
                    >
                      Details
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </>
      )}
      {viewState.selectedInstanceId && (
        <Drawer
          isExpanded={viewState.selectedInstanceId !== null}
          onExpand={() => {}}
          position="right"
        >
          <DrawerContent
            panelContent={
              <InstanceDetailDrawer
                instanceId={viewState.selectedInstanceId}
                detailQuery={detailQuery}
                onClose={handleDrawerClose}
                actions={detailQuery.data && detailQuery.data.id === viewState.selectedInstanceId &&
                  detailQuery.data.name === versionKey.workflowName && detailQuery.data.namespace === versionKey.namespace &&
                  detailQuery.data.version === versionKey.version && renderActions?.(detailQuery.data, () => {
                    void detailQuery.refetch();
                    void query.refetch();
                  })}
              />
            }
          >
            <DrawerContentBody>{/* Main content */}</DrawerContentBody>
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
};

interface InstanceDetailDrawerProps {
  readonly instanceId: string;
  readonly detailQuery: UseQueryResult<WorkflowInstance, Error>;
  readonly onClose: () => void;
  readonly actions?: ReactNode;
}

const InstanceDetailDrawer = ({ instanceId, detailQuery, onClose, actions }: InstanceDetailDrawerProps): ReactNode => {
  return (
    <DrawerPanelContent isResizable>
      <DrawerHead>
        <span>Instance {instanceId.substring(0, 8)}...</span>
        <DrawerCloseButton onClick={onClose} />
      </DrawerHead>
      <DrawerContentBody>
        {detailQuery.isPending ? (
          <Bullseye>
            <Spinner aria-label="Loading instance details" />
          </Bullseye>
        ) : detailQuery.isError ? (
          <div style={{ padding: "1rem" }}>
            <EmptyState titleText="Instance details unavailable" headingLevel="h3" status="warning">
              <EmptyStateBody>Could not load the full instance details.</EmptyStateBody>
            </EmptyState>
          </div>
        ) : detailQuery.data ? (
          <div style={{ padding: "1rem" }}>
            <Table aria-label="Instance details" variant="compact">
              <Tbody>
                <Tr>
                  <Td dataLabel="ID">
                    <code style={{ wordBreak: "break-all" }}>{detailQuery.data.id}</code>
                  </Td>
                </Tr>
                <Tr>
                  <Td dataLabel="Status">{detailQuery.data.status}</Td>
                </Tr>
                <Tr>
                  <Td dataLabel="Namespace">{detailQuery.data.namespace}</Td>
                </Tr>
                <Tr>
                  <Td dataLabel="Workflow">{detailQuery.data.name}</Td>
                </Tr>
                <Tr>
                  <Td dataLabel="Version">{detailQuery.data.version}</Td>
                </Tr>
                {detailQuery.data.startedAt && (
                  <Tr>
                    <Td dataLabel="Started">{detailQuery.data.startedAt}</Td>
                  </Tr>
                )}
                {detailQuery.data.endedAt && (
                  <Tr>
                    <Td dataLabel="Ended">{detailQuery.data.endedAt}</Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
            {actions}
          </div>
        ) : null}
      </DrawerContentBody>
    </DrawerPanelContent>
  );
};

interface InstanceHistoryErrorStateProps {
  readonly error: Error | null;
  readonly onRetry: () => void;
  readonly retrying: boolean;
}

const InstanceHistoryErrorState = ({ error, onRetry, retrying }: InstanceHistoryErrorStateProps): ReactNode => {
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
      <EmptyState titleText="Index pending" headingLevel="h2" status="warning">
        <EmptyStateBody>
          The gateway cannot discover a ready Data Index yet. Retry history when the index is available.
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
          The workflow gateway could not be reached.
        </EmptyStateBody>
        <Button onClick={onRetry} isLoading={retrying}>
          Retry
        </Button>
      </EmptyState>
    );
  }

  if (gatewayError?.kind === "upstream-error") {
    return (
      <EmptyState titleText="Index unavailable" headingLevel="h2" status="danger">
        <EmptyStateBody>
          The Data Index is temporarily unavailable. Try again in a moment.
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
          You do not have permission to view instance history.
        </EmptyStateBody>
      </EmptyState>
    );
  }

  return (
    <EmptyState titleText="History unavailable" headingLevel="h2" status="warning">
      <EmptyStateBody>The gateway could not return instance history.</EmptyStateBody>
      <Button onClick={onRetry} isLoading={retrying}>
        Retry
      </Button>
    </EmptyState>
  );
};
