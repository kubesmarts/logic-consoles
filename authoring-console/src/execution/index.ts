/**
 * Execution module — Run panel + instance lifecycle.
 *
 * Entry point for Packet G. Exports the Run panel (schema-driven form + sync/async
 * execution), instance lifecycle controls (suspend/resume/cancel), and the Run action
 * slot for injection into TopologyView.
 */
export { RunPanel } from "./RunPanel.tsx";
export { InstanceLifecycle } from "./InstanceLifecycle.tsx";
export { RunActionSlot } from "./RunActionSlot.tsx";
export type { RunState, ExecutionResult, InstanceAction, LifecycleState } from "./types.ts";
