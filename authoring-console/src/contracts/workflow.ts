/**
 * Workflow identity — KEPT SEPARATE from Kubernetes CR identity.
 *
 * A workflow family is keyed by (effective Kubernetes namespace + workflow document
 * name). A version adds the version string. The Kubernetes CR name is a SEPARATE
 * field (see ResourceRef) and MAY DIFFER from the workflow name: the console
 * generates a deterministic CR name (ADR 0001 "Suggested versions and generated CR
 * names"), while hand-authored CRs (for example the operator sample
 * `hello-world-v1-0-0`) carry their own names. Downstream packets hinge on never
 * conflating `workflowName` with the CR `metadata.name`.
 *
 * Resolution convention (ADR 0001 / PLAN step 5): to open the Kubernetes CR for a
 * selected version, list LogicFlowDefinitions in the effective namespace filtered by
 * the workflow-name and workflow-version labels, then fetch the object by its
 * returned `metadata.name`.
 */
import type { ResourceRef } from "./kubernetes.ts";

/** A workflow family. This is NOT the CR name. */
export interface WorkflowKey {
  /** Effective Kubernetes namespace (admission normalizes the document namespace to it). */
  readonly namespace: string;
  /** The `spec.flow` document.name — immutable across versions. */
  readonly workflowName: string;
}

/** A specific version of a family. Version is part of identity. */
export interface WorkflowVersionKey extends WorkflowKey {
  /** The workflow document version string (SemVer-ish, must also be a valid label value). */
  readonly version: string;
}

/**
 * Resolves a WorkflowVersionKey to its actual Kubernetes CR. `resource.name` MAY
 * differ from `version.workflowName`. Produced by the label-filtered lookup above.
 */
export interface WorkflowVersionResolution {
  readonly version: WorkflowVersionKey;
  /** The real CR (its `metadata.name` may be console-generated or hand-authored). */
  readonly resource: ResourceRef;
}

export const workflowKeyEquals = (a: WorkflowKey, b: WorkflowKey): boolean =>
  a.namespace === b.namespace && a.workflowName === b.workflowName;

export const workflowVersionKeyEquals = (a: WorkflowVersionKey, b: WorkflowVersionKey): boolean =>
  workflowKeyEquals(a, b) && a.version === b.version;

/** Stable string form for keying caches/maps. Not a CR name. */
export const workflowKeyToString = (key: WorkflowKey): string =>
  `${key.namespace}/${key.workflowName}`;

export const workflowVersionKeyToString = (key: WorkflowVersionKey): string =>
  `${key.namespace}/${key.workflowName}@${key.version}`;

/**
 * Inputs to the deterministic console CR-name generator (ADR 0001
 * "Suggested versions and generated CR names"). Packet A models the shape only; the
 * generation + collision/truncation/hashing algorithm belongs to the publish packet
 * (E). The intent here is to make explicit that a generated CR name is DERIVED from
 * workflow identity and is not the identity itself.
 */
export interface GeneratedCrNameInput {
  readonly namespace: string;
  readonly workflowName: string;
  readonly version: string;
}
