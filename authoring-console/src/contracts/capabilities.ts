/**
 * Capability checks (Kubernetes SelfSubjectAccessReview, "can-i").
 *
 * Permissions are checked per resource/verb and independently (ADR 0001:
 * "Check each capability independently and handle a 403 even after preflight";
 * "Keep platform write permission independent of workflow publishing"). Discovery
 * itself can 403, so the decision has an explicit `unknown` state distinct from
 * `denied` — "forbidden to even check" is not the same as "checked and denied".
 */

export type KubeVerb = "get" | "list" | "watch" | "create" | "update" | "patch" | "delete";

export interface ResourceAttributes {
  /** Empty string for the core API group. */
  readonly group: string;
  /** Plural resource name, for example "logicflowdefinitions" or "namespaces". */
  readonly resource: string;
  readonly verb: KubeVerb;
  /** Omit for a cluster-scoped check. */
  readonly namespace?: string;
}

/**
 * - `allowed`: the review returned allowed.
 * - `denied`: the review returned not-allowed.
 * - `unknown`: the access review itself could not be performed (for example the
 *   caller may not run SelfSubjectAccessReview, or discovery 403'd). Treat as
 *   "unverified", not as denied — keep accessible workflows usable.
 */
export type CapabilityDecision = "allowed" | "denied" | "unknown";

export interface CapabilityResult {
  readonly attributes: ResourceAttributes;
  readonly decision: CapabilityDecision;
  readonly reason?: string;
}

export interface CapabilityTransport {
  /** Evaluate a single attribute set. Never throws for a plain denial — returns `denied`. */
  canI(attributes: ResourceAttributes, signal?: AbortSignal): Promise<CapabilityResult>;

  /** Batch convenience; order of results matches the input order. */
  canIBatch(
    attributes: readonly ResourceAttributes[],
    signal?: AbortSignal,
  ): Promise<readonly CapabilityResult[]>;
}
