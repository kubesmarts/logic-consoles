/**
 * Shared operational views entry point (host-independent).
 *
 * These views are exported for reuse by both the Authoring Console and
 * a future Operational Console plugin. They take transport and navigation
 * by injection, so they render in a minimal second host without app shell
 * or mutation dependencies.
 */
export { TopologyView } from "./TopologyView.tsx";
export { InstanceHistoryView } from "./InstanceHistoryView.tsx";
