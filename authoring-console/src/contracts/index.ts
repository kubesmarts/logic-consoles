/**
 * Authoring Console typed boundary — single entry point.
 *
 * Packets B–H depend on these contracts. Host-independent gateway types, read views
 * and query shapes live here behind injected transport + navigation so a future
 * OpenShift / Operational Console plugin can reuse them without the launcher,
 * setup wizards or mutation code (ADR 0001 "Frontend composition").
 *
 * This module is pure types + constants + pure helpers. It never performs I/O, never
 * logs, and never persists credentials, tokens or execution payloads.
 */
export * from "./result.ts";
export * from "./session.ts";
export * from "./operator.ts";
export * from "./kubernetes.ts";
export * from "./capabilities.ts";
export * from "./errors.ts";
export * from "./workflow.ts";
export * from "./gateway.ts";
export * from "./storage.ts";
export * from "./compatibility.ts";
