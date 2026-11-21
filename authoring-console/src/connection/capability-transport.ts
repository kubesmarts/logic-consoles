/**
 * Capability transport implementation.
 *
 * Uses Kubernetes SelfSubjectAccessReview to check permissions.
 * Maps 403 and errors to the CapabilityDecision taxonomy (allowed/denied/unknown).
 */
import type {
  CapabilityTransport,
  ResourceAttributes,
  CapabilityResult,
  KubernetesTransport,
  WriteCandidate,
} from "../contracts/index.ts";

/** SelfSubjectAccessReview spec. */
interface SelfSubjectAccessReviewSpec {
  readonly resourceAttributes: {
    readonly group: string;
    readonly resource: string;
    readonly verb: string;
    readonly namespace?: string;
  };
}

/** SelfSubjectAccessReview response status. */
interface SelfSubjectAccessReviewStatus {
  readonly allowed: boolean;
  readonly denied?: boolean;
  readonly reason?: string;
}

/** SelfSubjectAccessReview object. */
interface SelfSubjectAccessReview {
  readonly apiVersion: string;
  readonly kind: string;
  readonly spec: SelfSubjectAccessReviewSpec;
  readonly status?: SelfSubjectAccessReviewStatus;
}

/** Create capability transport using the Kubernetes transport. */
export const createCapabilityTransport = (
  k8sTransport: KubernetesTransport
): CapabilityTransport => {
  const canI = async (
    attributes: ResourceAttributes,
    signal?: AbortSignal
  ): Promise<CapabilityResult> => {
    const review: SelfSubjectAccessReview = {
      apiVersion: "authorization.k8s.io/v1",
      kind: "SelfSubjectAccessReview",
      spec: {
        resourceAttributes: {
          group: attributes.group,
          resource: attributes.resource,
          verb: attributes.verb,
          namespace: attributes.namespace,
        },
      },
    };

    try {
      // Create the access review
      const candidate: WriteCandidate<SelfSubjectAccessReviewSpec> = {
        object: review as never,
      };

      const result = await k8sTransport.create<
        SelfSubjectAccessReviewSpec,
        SelfSubjectAccessReviewStatus
      >(candidate, signal);

      // Extract decision from status
      if (result.status?.allowed === true) {
        return {
          attributes,
          decision: "allowed",
        };
      }

      return {
        attributes,
        decision: "denied",
        reason: result.status?.reason,
      };
    } catch (error) {
      // If we can't even perform the access review, return unknown
      return {
        attributes,
        decision: "unknown",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const canIBatch = async (
    attributesList: readonly ResourceAttributes[],
    signal?: AbortSignal
  ): Promise<readonly CapabilityResult[]> => {
    // Run checks in parallel
    const results = await Promise.all(
      attributesList.map((attributes) => canI(attributes, signal))
    );
    return results;
  };

  return {
    canI,
    canIBatch,
  };
};
