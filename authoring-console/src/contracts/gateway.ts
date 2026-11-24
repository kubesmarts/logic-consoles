/**
 * Workflow Gateway transport.
 *
 * Verified routes at operator commit b9a71660267f0cad794b95e010569b280a932da8
 * (workflow-gateway/internal/server/server.go, .../topology/graph.go,
 * .../dataindex/client.go):
 *
 *   GET  /v1/topology?namespace={ns}
 *   GET  /v1/definitions/
 *   GET  /v1/definitions/{namespace}/{name}/{version}   -> spec.flow ONLY (see note)
 *   GET  /v1/instances/?namespace=&name=&version=&status=
 *   GET  /v1/instances/{id}
 *   POST /v1/runtime/{namespace}/{name}/{version}        -> async, 202 + instance id
 *   POST /v1/runtime/{namespace}/{name}/{version}/sync   -> sync, 200 + runner output
 *   POST /v1/runtime/{namespace}/{name}/{version}/instance/{id}/{suspend|resume|cancel}
 *   (versionless POST /v1/runtime/{namespace}/{name}[...] also exists — OUT OF SCOPE,
 *    see VERSIONLESS_EXECUTE_NOTE; the console uses only the advertised versioned link.)
 *
 * NOTE (verified, contradicts the gateway OpenAPI prose): getDefinition encodes only
 * `spec.flow` (the portable workflow document), NOT the full CR. To edit the
 * Kubernetes envelope, read the full CR from Kubernetes by the resolved CR name.
 */
import type { WorkflowDocument } from "./operator.ts";
import type { WorkflowVersionKey } from "./workflow.ts";

/** A HATEOAS link as emitted in a definition resource's `_links` map. */
export interface GatewayLink {
  readonly href: string;
  readonly method: string;
  readonly operationId: string;
  /** True when the href contains a template variable (for example `{id}`). */
  readonly templated?: boolean;
}

/**
 * Verified `_links` relations on a definition resource. `suspend`, `resume` and
 * `cancel` are first-class, supported gateway operations (templated by instance id)
 * and are wired by the Run/instance packet (G) in the first release.
 */
export const DEFINITION_LINK_RELS = [
  "self",
  "execute",
  "executeSync",
  "instances",
  "instance",
  "suspend",
  "resume",
  "cancel",
] as const;
export type DefinitionLinkRel = (typeof DEFINITION_LINK_RELS)[number];

export type DefinitionLinks = Readonly<Record<DefinitionLinkRel, GatewayLink>>;

/**
 * A catalog entry. Its identity is the WORKFLOW identity (namespace + workflow name
 * + version) resolved from the operator labels — NOT the Kubernetes CR name. Model
 * it with the HATEOAS `_links` map.
 */
export interface DefinitionResource {
  readonly namespace: string;
  /** Workflow document name (from `logic.kubesmarts.org/workflow-name`), not the CR name. */
  readonly name: string;
  readonly version: string;
  readonly _links: DefinitionLinks;
}

export const definitionResourceKey = (d: DefinitionResource): WorkflowVersionKey => ({
  namespace: d.namespace,
  workflowName: d.name,
  version: d.version,
});

/* ------------------------------------------------------------------ *
 * Topology (verified shape: .../topology/graph.go)
 * ------------------------------------------------------------------ */

export interface TopologyNodeStatus {
  readonly state: string;
  readonly source: string;
}

export interface TopologyNode {
  readonly id: string;
  readonly kind: string;
  readonly namespace?: string;
  readonly name: string;
  readonly label: string;
  readonly status: TopologyNodeStatus;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface TopologyEdge {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly target: string;
  readonly weight?: number;
}

export interface TopologyWarning {
  readonly code: string;
  readonly kind: string;
  readonly nodeId?: string;
}

/** `discovery.partial` marks a partial graph; warnings explain missing sources. */
export interface TopologyDiscovery {
  readonly partial: boolean;
  readonly warnings: readonly TopologyWarning[];
}

export interface TopologyGraph {
  readonly nodes: readonly TopologyNode[];
  readonly edges: readonly TopologyEdge[];
  readonly discovery: TopologyDiscovery;
}

/* ------------------------------------------------------------------ *
 * Instances (verified shape: .../dataindex/client.go WorkflowInstance)
 * ------------------------------------------------------------------ */

export interface InstanceFilter {
  readonly namespace?: string;
  /** Workflow name. */
  readonly name?: string;
  readonly version?: string;
  readonly status?: string;
}

export interface WorkflowInstance {
  readonly id: string;
  readonly namespace: string;
  /** Workflow name. */
  readonly name: string;
  readonly version: string;
  readonly status: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
}

/* ------------------------------------------------------------------ *
 * Execution
 * ------------------------------------------------------------------ */

/** Workflow input is JSON sent as the POST body. Root shape depends on the workflow. */
export type WorkflowInput = unknown;

/** Async acceptance: 202 carrying the instance id (and the runner's application id). */
export interface ExecuteAsyncResult {
  readonly instanceId: string;
  /** Runner application id (pod) when the runner returns it. */
  readonly workflowApplicationId?: string;
  /** The full runner response, preserved verbatim. */
  readonly raw: unknown;
}

/** Sync result: 200 carrying the runner response including the workflow output. */
export interface ExecuteSyncResult {
  /** The workflow output as returned by the runner. */
  readonly output: unknown;
  /** The full runner response, preserved verbatim. */
  readonly raw: unknown;
}

/** Result of a suspend/resume/cancel POST. The runner decides whether the action was allowed. */
export interface InstanceActionResult {
  readonly instanceId: string;
  /** HTTP status the runner/gateway returned, so callers can distinguish a stale-state reject. */
  readonly httpStatus: number;
  readonly raw: unknown;
}

/**
 * Injected gateway transport. Read methods are safe to retry; execution and
 * lifecycle POSTs are NEVER retried automatically (a timed-out run stays in an
 * unknown state). Methods reject with a GatewayError (see errors.ts) so unreachable,
 * 503 index-pending, 502 upstream and denied are distinguishable; an empty result is
 * a successful empty list, not an error.
 */
export interface GatewayTransport {
  getTopology(namespace: string, signal?: AbortSignal): Promise<TopologyGraph>;

  listDefinitions(signal?: AbortSignal): Promise<readonly DefinitionResource[]>;

  /** Returns the portable workflow document (spec.flow) ONLY — not the full CR. */
  getDefinition(key: WorkflowVersionKey, signal?: AbortSignal): Promise<WorkflowDocument>;

  listInstances(filter: InstanceFilter, signal?: AbortSignal): Promise<readonly WorkflowInstance[]>;

  getInstance(id: string, signal?: AbortSignal): Promise<WorkflowInstance>;

  /** Execute via the version's advertised `execute` link only. Resolves on 202. */
  execute(link: GatewayLink, input: WorkflowInput, signal?: AbortSignal): Promise<ExecuteAsyncResult>;

  /** Execute via the version's advertised `executeSync` link only. Resolves on 200. */
  executeSync(
    link: GatewayLink,
    input: WorkflowInput,
    signal?: AbortSignal,
  ): Promise<ExecuteSyncResult>;

  /** Suspend via the advertised `suspend` link, substituting the instance id. */
  suspendInstance(
    link: GatewayLink,
    instanceId: string,
    signal?: AbortSignal,
  ): Promise<InstanceActionResult>;

  /** Resume via the advertised `resume` link, substituting the instance id. */
  resumeInstance(
    link: GatewayLink,
    instanceId: string,
    signal?: AbortSignal,
  ): Promise<InstanceActionResult>;

  /** Cancel via the advertised `cancel` link, substituting the instance id. */
  cancelInstance(
    link: GatewayLink,
    instanceId: string,
    signal?: AbortSignal,
  ): Promise<InstanceActionResult>;
}

/**
 * The versionless execute routes (`POST /v1/runtime/{namespace}/{name}` and its
 * `/sync` form) exist in the gateway but are OUT OF SCOPE for the console execution
 * contract (ADR 0001 "Execution target"): every run pins the selected version via
 * its advertised link. Documented here so downstream packets do not re-derive it.
 */
export const VERSIONLESS_EXECUTE_NOTE =
  "Versionless /v1/runtime/{namespace}/{name} routes exist but are out of the console execution contract.";
