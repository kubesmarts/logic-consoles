/**
 * Kubernetes resource identity and transport.
 *
 * Identity is deliberately general: it covers `logic.kubesmarts.org/v1` kinds AND
 * core/v1 resources such as a Namespace (PLAN "Create namespace" — a core/v1
 * Namespace create+dry-run with the caller's credentials) and the cluster-scoped
 * ClusterLogicPlatform singleton. The resourceVersion concurrency token is held
 * SEPARATELY from identity and is never conflated with the object name.
 *
 * The transport is injected (ADR 0001: "Inject transport and navigation"). This
 * module binds to no concrete HTTP client, so both the launcher's same-origin API
 * and the direct-browser adapter can satisfy it, and read-only views can be reused
 * by the Operational Console.
 */
import type { WriteError } from "./errors.ts";

export interface GroupVersionKind {
  /** Empty string for the core API group (for example core/v1 Namespace). */
  readonly group: string;
  readonly version: string;
  readonly kind: string;
}

export type ResourceScope = "Namespaced" | "Cluster";

/**
 * Identifies a concrete Kubernetes object. `namespace` is omitted for cluster-scoped
 * kinds (ClusterLogicPlatform, core/v1 Namespace). The CR name lives here and is
 * SEPARATE from workflow identity (see WorkflowKey).
 */
export interface ResourceRef {
  readonly gvk: GroupVersionKind;
  readonly name: string;
  /** Present only for namespaced kinds. */
  readonly namespace?: string;
}

/** Concurrency token. Held apart from identity; required on update to detect 409. */
export type ResourceVersion = string;

export interface ObjectMeta {
  readonly name: string;
  readonly namespace?: string;
  /** Opaque concurrency token. Never used as a display name or identity key. */
  readonly resourceVersion?: ResourceVersion;
  readonly generation?: number;
  readonly uid?: string;
  readonly labels?: Readonly<Record<string, string>>;
  readonly annotations?: Readonly<Record<string, string>>;
  readonly creationTimestamp?: string;
}

/** A standard Kubernetes status condition (metav1.Condition shape). */
export interface KubeCondition {
  readonly type: string;
  readonly status: "True" | "False" | "Unknown";
  readonly reason?: string;
  readonly message?: string;
  readonly observedGeneration?: number;
  readonly lastTransitionTime?: string;
}

export interface KubeObject<TSpec = unknown, TStatus = unknown> {
  readonly apiVersion: string;
  readonly kind: string;
  readonly metadata: ObjectMeta;
  readonly spec?: TSpec;
  readonly status?: TStatus;
}

export interface KubeList<T> {
  readonly apiVersion: string;
  readonly kind: string;
  readonly items: readonly T[];
  readonly metadata: {
    readonly resourceVersion?: string;
    readonly continue?: string;
  };
}

export interface ListOptions {
  /** Omit for a cluster-scoped list; set to scope a namespaced list. */
  readonly namespace?: string;
  readonly labelSelector?: string;
  readonly fieldSelector?: string;
  readonly limit?: number;
  readonly continue?: string;
}

export type WriteVerb = "create" | "update";

/**
 * A candidate object to submit. The SAME candidate is used for the server dry-run
 * and for the real write (ADR 0001 "Resource editing": "Validate and dry-run the
 * exact candidate"). On update, `expectedResourceVersion` MUST equal the loaded
 * resourceVersion so a 409 conflict surfaces instead of a silent overwrite.
 */
export interface WriteCandidate<TSpec = unknown> {
  readonly object: KubeObject<TSpec>;
  /** Required for update; omit for create. */
  readonly expectedResourceVersion?: ResourceVersion;
}

/**
 * Injected Kubernetes transport. All reads are safe to retry; writes are not
 * retried automatically. Writes reject with a typed WriteError (see errors.ts) so
 * admission (field-pathed), 409 conflict, forbidden and unreachable are
 * distinguishable by consumers.
 */
export interface KubernetesTransport {
  get<TSpec = unknown, TStatus = unknown>(
    ref: ResourceRef,
    signal?: AbortSignal,
  ): Promise<KubeObject<TSpec, TStatus>>;

  list<TSpec = unknown, TStatus = unknown>(
    gvk: GroupVersionKind,
    options: ListOptions,
    signal?: AbortSignal,
  ): Promise<KubeList<KubeObject<TSpec, TStatus>>>;

  /** Server dry-run of the exact candidate that will be submitted. */
  dryRun<TSpec = unknown, TStatus = unknown>(
    candidate: WriteCandidate<TSpec>,
    verb: WriteVerb,
    signal?: AbortSignal,
  ): Promise<KubeObject<TSpec, TStatus>>;

  create<TSpec = unknown, TStatus = unknown>(
    candidate: WriteCandidate<TSpec>,
    signal?: AbortSignal,
  ): Promise<KubeObject<TSpec, TStatus>>;

  /** Requires `candidate.expectedResourceVersion`; rejects with a `conflict` WriteError on 409. */
  update<TSpec = unknown, TStatus = unknown>(
    candidate: WriteCandidate<TSpec>,
    signal?: AbortSignal,
  ): Promise<KubeObject<TSpec, TStatus>>;

  /**
   * Observe status/conditions after a write. Optional: a host without watch support
   * refetches instead. Returns an unsubscribe function. observedGeneration should be
   * compared against metadata.generation where available.
   */
  watchStatus?<TSpec = unknown, TStatus = unknown>(
    ref: ResourceRef,
    onEvent: (object: KubeObject<TSpec, TStatus>) => void,
    signal?: AbortSignal,
  ): () => void;
}

/** A rejection carrying a typed WriteError. Hosts should reject writes with this shape. */
export interface KubernetesWriteRejection {
  readonly writeError: WriteError;
}

export const isKubernetesWriteRejection = (value: unknown): value is KubernetesWriteRejection =>
  typeof value === "object" && value !== null && "writeError" in value;
