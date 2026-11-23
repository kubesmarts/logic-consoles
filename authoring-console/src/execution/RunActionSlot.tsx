/**
 * Run action slot for injection into TopologyView (Packet F).
 *
 * Renders a "Run" button in the definition drawer that opens the Run panel for
 * the selected deployed version.
 */
import { useState, type ReactNode } from "react";
import { Button } from "@patternfly/react-core";
import type { TopologyNode } from "../contracts/index.ts";
import type { GatewayTransport, WorkflowVersionKey } from "../contracts/index.ts";
import { VersionRunPanel } from "./VersionExecution.tsx";

export interface RunActionSlotProps {
  readonly node: TopologyNode;
  readonly gateway: GatewayTransport;
}

/**
 * Run action slot for topology. The node must be a reconciled LogicFlowDefinition
 * (kind === "LogicFlowDefinition" with node.label = workflow name, node.details.version = version).
 */
export const RunActionSlot = ({ node }: RunActionSlotProps): ReactNode => {
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
      {runPanelOpen && <VersionRunPanel versionKey={versionKey} onClose={() => setRunPanelOpen(false)} />}
    </>
  );
};
