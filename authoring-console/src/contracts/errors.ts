/**
 * Error taxonomy — explicit, distinguishable states.
 *
 * The console must represent absence, access denial, partial discovery and
 * temporary failure separately (AGENTS.md; DESIGN.md "Feedback states"). These
 * discriminated unions keep each cause its own UI branch instead of a single
 * "something went wrong".
 */
import type { ResourceRef, ResourceVersion } from "./kubernetes.ts";
import type { WorkflowVersionKey } from "./workflow.ts";
import type { StageStatus } from "./result.ts";

/* ------------------------------------------------------------------ *
 * Discovery / installation states
 * ------------------------------------------------------------------ */

/**
 * Result of discovering the operator APIs and controller health. A served CRD
 * alone is NOT a controller-health signal (ADR 0001).
 */
export type InstallationState =
  | { readonly kind: "installed"; readonly servedKinds: readonly string[] }
  /** None of the expected `logic.kubesmarts.org/v1` kinds are served. */
  | { readonly kind: "missing-apis"; readonly missing: readonly string[] }
  /** Some expected kinds are served and some are missing. */
  | {
      readonly kind: "partial-install";
      readonly served: readonly string[];
      readonly missing: readonly string[];
    }
  /** Discovery itself returned 403 — the caller could not inspect installation. */
  | { readonly kind: "forbidden-discovery"; readonly attempted: string }
  /** The Kubernetes API could not be reached at all. */
  | { readonly kind: "api-unreachable"; readonly detail?: string }
  /** Kinds are served but the controller is not healthy/ready where observable. */
  | { readonly kind: "operator-unhealthy"; readonly detail?: string };

/* ------------------------------------------------------------------ *
 * Write errors
 * ------------------------------------------------------------------ */

/** An admission/validation error attributed to a field or YAML path. */
export interface FieldError {
  /** JSON/YAML path, for example "spec.runtimeRef.name". */
  readonly path: string;
  readonly message: string;
}

export type WriteError =
  /** Admission or schema validation rejected the candidate; errors are field-pathed. */
  | { readonly kind: "admission"; readonly errors: readonly FieldError[] }
  /** 409: the loaded resourceVersion was stale. Carries the server's latest where known. */
  | { readonly kind: "conflict"; readonly latestResourceVersion?: ResourceVersion }
  /** 403: the caller may not perform this write. */
  | { readonly kind: "forbidden"; readonly reason?: string }
  /** The API server could not be reached. */
  | { readonly kind: "unreachable"; readonly detail?: string }
  /** Any other server-side failure. */
  | { readonly kind: "server-error"; readonly status?: number; readonly detail?: string };

/* ------------------------------------------------------------------ *
 * Gateway errors
 * ------------------------------------------------------------------ */

/**
 * Gateway failure states. `empty` is modeled distinctly from a failure: an empty
 * catalog, topology or history is a valid, successful answer, not an error.
 */
export type GatewayError =
  /** The gateway address could not be reached (leaves Kubernetes actions usable). */
  | { readonly kind: "unreachable"; readonly detail?: string }
  /** 503: index/discovery pending (also used when Data Index is not yet discovered). */
  | { readonly kind: "index-pending" }
  /** 502: an upstream dependency (runner / Data Index) failed. */
  | { readonly kind: "upstream-error"; readonly detail?: string }
  /** 403: the request was denied by the gateway. */
  | { readonly kind: "denied"; readonly reason?: string };

/* ------------------------------------------------------------------ *
 * The four distinct publish → runnable states
 * ------------------------------------------------------------------ */

/**
 * ADR 0001: "A successful Kubernetes write, a reconciled resource, a routable
 * workflow and an indexed execution are four distinct UI states." They are NOT a
 * single linear enum — each is observed through a different system (API server,
 * operator, gateway catalog, Data Index) and can succeed, fail or stay unknown
 * independently. Never collapse these four.
 */
export interface DeploymentReadiness {
  /** 1. The Kubernetes API accepted the create/update. */
  readonly kubernetesWrite: StageStatus<WriteError>;
  /** 2. The operator reconciled the resource (conditions / observedGeneration). */
  readonly reconciled: StageStatus;
  /** 3. The gateway can route the workflow version (catalog entry + execute link). */
  readonly routable: StageStatus<GatewayError>;
  /** 4. An execution of the version is indexed in Data Index (history is visible). */
  readonly indexed: StageStatus<GatewayError>;
}

/** Evidence linking a readiness report back to concrete identities. */
export interface DeploymentReadinessContext {
  readonly resource: ResourceRef;
  readonly version: WorkflowVersionKey;
}
