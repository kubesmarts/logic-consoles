import type { ReactNode } from "react";
import { Alert, Button, Spinner } from "@patternfly/react-core";
import { useQuery } from "@tanstack/react-query";
import { useConsole } from "../app/ConsoleContext.tsx";
import { useWorkflowFlow } from "../app/queries.ts";
import type { WorkflowVersionKey } from "../contracts/index.ts";
import { usePlatform } from "../setup/usePlatform.ts";
import { InstanceHistoryView } from "../shared/operations/InstanceHistoryView.tsx";
import { InstanceLifecycle } from "./InstanceLifecycle.tsx";
import { RunPanel } from "./RunPanel.tsx";

/** Kubernetes RBAC may hide configuration. In that case, let the gateway answer history reads. */
function useIndexConfiguration() {
  const platform = usePlatform();
  return platform.data ? Boolean(platform.data.spec?.dataIndex) : undefined;
}

function useCatalogEntry(key: WorkflowVersionKey) {
  const { session, gateway } = useConsole();
  return useQuery({
    queryKey: [session.sessionId, "execution-catalog"],
    queryFn: ({ signal }) => gateway.listDefinitions(signal),
    select: (catalog) => catalog.find((item) =>
      item.name === key.workflowName && item.version === key.version && item.namespace === key.namespace),
  });
}

export function VersionHistory({ versionKey, acceptedId }: { versionKey: WorkflowVersionKey; acceptedId?: string }): ReactNode {
  const { session, gateway } = useConsole();
  const definition = useCatalogEntry(versionKey).data;
  const index = useIndexConfiguration();
  if (index === false) return <Alert isInline variant="info" title="Instance history is disabled">Enable Data Index on the platform to collect instance history.</Alert>;
  return <InstanceHistoryView key={JSON.stringify([session.sessionId, versionKey, acceptedId])}
    sessionId={session.sessionId} versionKey={versionKey} gateway={gateway} acceptedId={acceptedId}
    renderActions={(instance, refresh) => definition &&
      <InstanceLifecycle key={instance.id} definition={definition} gateway={gateway} instanceId={instance.id} onActionComplete={refresh} />} />;
}

export function VersionRunPanel({ versionKey, onClose }: { versionKey: WorkflowVersionKey; onClose: () => void }): ReactNode {
  const { gateway, session } = useConsole();
  const entry = useCatalogEntry(versionKey);
  const flow = useWorkflowFlow(versionKey);
  const index = useIndexConfiguration();
  if (entry.isPending || flow.isPending) return <Spinner aria-label="Loading run configuration" />;
  if (!entry.data || !flow.data) return <Alert isInline variant="warning" title="Run configuration unavailable">
    Read the selected version and its execution links to run this workflow.
    <Button variant="link" onClick={() => { void entry.refetch(); void flow.refetch(); }}>Retry</Button>
    <Button variant="link" onClick={onClose}>Close</Button>
  </Alert>;
  return <RunPanel key={JSON.stringify([session.sessionId, versionKey])}
    definition={entry.data} flow={flow.data} gateway={gateway} isOpen onClose={onClose}
    historyEnabled={index}
    renderHistory={(id) => <VersionHistory versionKey={versionKey} acceptedId={id} />} />;
}
