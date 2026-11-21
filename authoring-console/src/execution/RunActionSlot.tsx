/**
 * Run action slot for injection into TopologyView (Packet F).
 *
 * Renders a "Run" button in the definition drawer that opens the Run panel for
 * the selected deployed version.
 */
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@patternfly/react-core";
import type { TopologyNode } from "../contracts/index.ts";
import type { GatewayTransport, WorkflowVersionKey } from "../contracts/index.ts";
import { RunPanel } from "./RunPanel.tsx";

export interface RunActionSlotProps {
  readonly node: TopologyNode;
  readonly gateway: GatewayTransport;
}

/**
 * Run action slot for topology. The node must be a reconciled LogicFlowDefinition
 * (kind === "LogicFlowDefinition" with node.label = workflow name, node.details.version = version).
 */
export const RunActionSlot = ({ node, gateway }: RunActionSlotProps): ReactNode => {
  const [runPanelOpen, setRunPanelOpen] = useState(false);

  if (node.kind !== "LogicFlowDefinition" || !node.namespace || !node.details) {
    return null;
  }

  const workflowName = node.label;
  const version = (node.details as Record<string, unknown>)?.version as string | undefined;
  const namespace = node.namespace;

  if (!workflowName || !version) {
    return null; // Not reconciled yet
  }

  const versionKey: WorkflowVersionKey = { namespace, workflowName, version };

  return (
    <>
      <Button variant="secondary" onClick={() => setRunPanelOpen(true)} style={{ width: "100%" }}>
        Run
      </Button>
      <RunPanelFromTopology
        versionKey={versionKey}
        gateway={gateway}
        isOpen={runPanelOpen}
        onClose={() => setRunPanelOpen(false)}
      />
    </>
  );
};

const RunPanelFromTopology = ({
  versionKey,
  gateway,
  isOpen,
  onClose,
}: {
  readonly versionKey: WorkflowVersionKey;
  readonly gateway: GatewayTransport;
  readonly isOpen: boolean;
  readonly onClose: () => void;
}): ReactNode => {
  const catalogQuery = useQuery({
    queryKey: ["catalog"],
    queryFn: ({ signal }) => gateway.listDefinitions(signal),
  });

  const flowQuery = useQuery({
    queryKey: ["flow", versionKey.namespace, versionKey.workflowName, versionKey.version],
    queryFn: ({ signal }) => gateway.getDefinition(versionKey, signal),
    enabled: isOpen,
  });

  const definition = catalogQuery.data?.find(
    (d) =>
      d.namespace === versionKey.namespace &&
      d.name === versionKey.workflowName &&
      d.version === versionKey.version,
  );

  if (!isOpen) return null;
  if (!definition || !flowQuery.data) return null;

  return <RunPanel definition={definition} flow={flowQuery.data} gateway={gateway} isOpen={isOpen} onClose={onClose} />;
};
