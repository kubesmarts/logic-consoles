/**
 * Capability fixtures for two identities:
 * - cluster-admin: every verb allowed.
 * - reduced-rights author: can read everything and write definitions in `default`,
 *   but is DENIED platform writes (create/update ClusterLogicPlatform) — keeping
 *   platform write permission independent of workflow publishing (ADR 0001).
 */
import type { CapabilityDecision, CapabilityResult, ResourceAttributes } from "../contracts/index.ts";

export type FixtureIdentity = "cluster-admin" | "reduced-rights-author";

const result = (attributes: ResourceAttributes, decision: CapabilityDecision, reason?: string): CapabilityResult =>
  reason === undefined ? { attributes, decision } : { attributes, decision, reason };

const isPlatformWrite = (a: ResourceAttributes): boolean =>
  a.resource === "clusterlogicplatforms" && (a.verb === "create" || a.verb === "update" || a.verb === "patch" || a.verb === "delete");

/** Decide a single capability for an identity. Used by the fixture capability transport. */
export const decideCapability = (identity: FixtureIdentity, attributes: ResourceAttributes): CapabilityResult => {
  if (identity === "cluster-admin") {
    return result(attributes, "allowed");
  }
  // reduced-rights author
  if (isPlatformWrite(attributes)) {
    return result(attributes, "denied", "Author may not modify the cluster platform.");
  }
  return result(attributes, "allowed");
};
