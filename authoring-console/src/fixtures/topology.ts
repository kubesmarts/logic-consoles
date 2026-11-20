/**
 * Topology fixtures: a healthy full graph and a partial graph (discovery.partial
 * with warnings), matching the verified gateway response shape.
 */
import type { TopologyGraph } from "../contracts/index.ts";

export const topologyFullFixture: TopologyGraph = {
  nodes: [
    { id: "platform/cluster-platform", kind: "ClusterLogicPlatform", name: "cluster-platform", label: "Platform", status: { state: "Ready", source: "operator" } },
    { id: "runtime/default/hello-runtime", kind: "LogicFlowRuntime", namespace: "default", name: "hello-runtime", label: "hello-runtime", status: { state: "Ready", source: "operator" } },
    { id: "definition/default/hello-world/1.0.0", kind: "LogicFlowDefinition", namespace: "default", name: "hello-world", label: "hello-world 1.0.0", status: { state: "Ready", source: "gateway" }, details: { version: "1.0.0", crName: "hello-world-v-1-0-0" } },
    { id: "definition/default/hello-world/1.1.0", kind: "LogicFlowDefinition", namespace: "default", name: "hello-world", label: "hello-world 1.1.0", status: { state: "Ready", source: "gateway" }, details: { version: "1.1.0", crName: "hello-world-v-1-1-0" } },
  ],
  edges: [
    { id: "e1", type: "hosts", source: "platform/cluster-platform", target: "runtime/default/hello-runtime" },
    { id: "e2", type: "runs", source: "runtime/default/hello-runtime", target: "definition/default/hello-world/1.0.0" },
    { id: "e3", type: "runs", source: "runtime/default/hello-runtime", target: "definition/default/hello-world/1.1.0" },
  ],
  discovery: { partial: false, warnings: [] },
};

/** A partial graph: the runtime node is missing and a warning explains why. */
export const topologyPartialFixture: TopologyGraph = {
  nodes: [
    { id: "definition/default/hello-world/1.0.0", kind: "LogicFlowDefinition", namespace: "default", name: "hello-world", label: "hello-world 1.0.0", status: { state: "Unknown", source: "gateway" }, details: { version: "1.0.0" } },
  ],
  edges: [],
  discovery: {
    partial: true,
    warnings: [{ code: "RuntimeUnreadable", kind: "LogicFlowRuntime", nodeId: "runtime/default/hello-runtime" }],
  },
};
