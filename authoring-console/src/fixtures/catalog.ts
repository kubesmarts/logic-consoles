/**
 * Gateway catalog fixtures: DefinitionResource entries with HATEOAS `_links`.
 *
 * The `_links` are built exactly as the gateway builds them
 * (workflow-gateway/internal/server/server.go), so the catalog entry's identity is
 * the WORKFLOW identity (namespace + workflow name + version) and never the CR name.
 */
import type { DefinitionLinks, DefinitionResource, WorkflowVersionKey } from "../contracts/index.ts";

const buildLinks = (key: WorkflowVersionKey): DefinitionLinks => {
  const ns = encodeURIComponent(key.namespace);
  const name = encodeURIComponent(key.workflowName);
  const version = encodeURIComponent(key.version);
  const identity = `${ns}/${name}/${version}`;
  const runtimePath = `/v1/runtime/${ns}/${name}/${version}`;
  const instanceQuery = new URLSearchParams({
    namespace: key.namespace,
    name: key.workflowName,
    version: key.version,
  }).toString();
  return {
    self: { href: `/v1/definitions/${identity}`, method: "GET", operationId: "getDefinition" },
    execute: { href: runtimePath, method: "POST", operationId: "executeWorkflowVersioned" },
    executeSync: { href: `${runtimePath}/sync`, method: "POST", operationId: "executeWorkflowSyncVersioned" },
    instances: { href: `/v1/instances/?${instanceQuery}`, method: "GET", operationId: "listInstances" },
    instance: { href: "/v1/instances/{id}", method: "GET", operationId: "getInstance", templated: true },
    suspend: { href: `${runtimePath}/instance/{id}/suspend`, method: "POST", operationId: "suspendInstanceVersioned", templated: true },
    resume: { href: `${runtimePath}/instance/{id}/resume`, method: "POST", operationId: "resumeInstanceVersioned", templated: true },
    cancel: { href: `${runtimePath}/instance/{id}/cancel`, method: "POST", operationId: "cancelInstanceVersioned", templated: true },
  };
};

const definition = (namespace: string, workflowName: string, version: string): DefinitionResource => ({
  namespace,
  name: workflowName,
  version,
  _links: buildLinks({ namespace, workflowName, version }),
});

/**
 * The deployed catalog:
 * - hello-world has TWO versions on one runtime (list + detail + publish-second-version).
 * - payments has one version whose CR name differs from its workflow name.
 */
export const catalogFixture: readonly DefinitionResource[] = [
  definition("default", "hello-world", "1.0.0"),
  definition("default", "hello-world", "1.1.0"),
  definition("default", "payments", "2.1.0"),
];
