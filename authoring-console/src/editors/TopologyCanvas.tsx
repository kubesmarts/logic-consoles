/**
 * React Flow (@xyflow/react v13) canvas for cluster topology. Honours the resolved
 * theme via `colorMode`. A keyboard-accessible list of the same nodes is rendered
 * alongside so graph interactions always have a text equivalent (AGENTS.md,
 * DESIGN.md "Graph / List").
 *
 * This is a read stub: it maps the gateway topology fixture into nodes/edges. Rich
 * selection/drawer behaviour belongs to the shared operational views packet (F).
 */
import { useMemo, type ReactNode } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { TopologyGraph } from "../contracts/index.ts";
import { useTheme } from "../app/theme.tsx";

export interface TopologyCanvasProps {
  readonly graph: TopologyGraph;
  /**
   * Optional callback when a topology node is clicked in the graph.
   * Packet F wires this to open the definition selection drawer.
   */
  readonly onNodeSelect?: (nodeId: string) => void;
}

export const TopologyCanvas = ({ graph, onNodeSelect }: TopologyCanvasProps): ReactNode => {
  const { resolved } = useTheme();

  const nodes = useMemo<Node[]>(
    () =>
      graph.nodes.map((node, index) => ({
        id: node.id,
        data: { label: node.label },
        position: { x: (index % 3) * 240, y: Math.floor(index / 3) * 140 },
      })),
    [graph.nodes],
  );

  const edges = useMemo<Edge[]>(
    () => graph.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, label: edge.type })),
    [graph.edges],
  );

  const handleNodeClick = (nodeId: string) => {
    onNodeSelect?.(nodeId);
  };

  return (
    <div>
      <div data-testid="topology-canvas" style={{ height: "480px", width: "100%" }}>
        <ReactFlow nodes={nodes} edges={edges} forceColorMode={resolved} fitView onNodeClick={(_event, node) => handleNodeClick(node.id)}>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      <ul aria-label="Topology nodes (list view)">
        {graph.nodes.map((node) => (
          <li key={node.id}>
            {node.label} — {node.kind} — {node.status.state}
          </li>
        ))}
      </ul>
    </div>
  );
};
