# Operational Console — One-Pager

**Status:** Proposal
**Date:** 2026-10-29
**Audience:** Product, platform, gateway, and frontend engineering

## Intent

Add a **Logic** entry to the OpenShift web console after Logic Operator installation. This is the cluster-local operational view of the Workflow Gateway: show what is deployed and let users inspect workflow instance history without turning the OpenShift console into a workflow execution surface.

## User experience

- A topology page draws `LogicPlatform`, Workflow Gateway, Data Index, `LogicFlowRuntime` runners, `LogicFlowDefinition` resources, and known dependencies as connected, selectable nodes. Show readiness, namespace, versions, and conditions from authoritative resource status; distinguish “not configured,” “unknown,” and “unavailable.”
- A definitions view links a workflow/version to its runtime and lets a user inspect its Open Workflow document.
- An instances view queries Data Index through the gateway, supports namespace/workflow/status filters, and opens instance details/history.
- Use the OpenShift console’s navigation, visual language, and user identity. The initial scope is read-only: topology, definitions, and instance history/details. It does not call gateway endpoints that start a workflow or forward suspend/resume/cancel operations to a runner. If lifecycle controls are desired, decide and authorize them as a separate capability.

## Architecture and dependencies

Package shared React views, gateway clients, API types, and topology/instance models in a shared React package. Build the OpenShift dynamic plugin as a thin host adapter that supplies navigation, user context, and the gateway connection. The same shared views can then be embedded in the standalone Authoring Console without importing OpenShift-only APIs into the shared package.

Deliver the plugin using the OpenShift Console Dynamic Plugin mechanism (`ConsolePlugin` resource, plugin assets served by a cluster workload, and console plugin enablement through the Console operator configuration). Use the Console service proxy and `consoleFetch` for in-cluster gateway calls, with HTTPS and the logged-in user’s token where supported. Track the OpenShift Console SDK version range as a compatibility target and use PatternFly/OpenShift design conventions for the plugin shell.

The gateway has no topology route today; [issue #79](https://github.com/kubesmarts/logic-operator/issues/79) tracks the API. Add `GET /v1/topology` (and describe it in the existing OpenAPI document) as the source for a stable graph response. Each node should carry a kind, namespace/name identity, display label, observed state, and source; each edge should identify a typed relationship. Support namespace filtering and return partial results with explicit unknown/unavailable states when optional infrastructure cannot be discovered. Never include secret values, credentials, or connection strings. The Gateway currently has read access to LogicPlatform, LogicFlowService, LogicFlowDefinition, and Lease resources; it does not currently read LogicFlowRuntime resources, Deployments, Pods, or arbitrary external PostgreSQL/observability installations. Expand RBAC only for fields the topology needs and keep optional infrastructure reporting best-effort.

**Authorization is a release dependency.** The gateway’s Kubernetes service account reads cluster resources independently of the OpenShift user. Passing a user token through the Console proxy alone does not make the gateway enforce that user’s Kubernetes RBAC. Before exposing cross-namespace topology, definition documents, or instance data, define and implement user-aware authorization (for example, delegated Kubernetes authorization checks) and test it against namespace-scoped users. Do not rely on a broadly privileged service account as the UI’s authorization boundary.

## MVP scope and acceptance

- Installing Logic Operator deploys/registers the plugin and documents any required Console enablement step.
- The menu item loads only when the plugin is enabled and shows useful loading, empty, forbidden, and partial-topology states.
- Topology returns a connected graph for operator-managed resources, with unknown/unavailable markers for optional systems the gateway cannot verify.
- A user can inspect definitions and query instance history/details through the gateway using their own authorized access.
- Requests are read-only; no workflow start or runner lifecycle operation is exposed.
- A namespace-limited user cannot see unauthorized namespaces or instance data.

## Open decisions

- Confirm whether OpenShift authorization should use delegated Kubernetes checks at the gateway or a Console backend/API proxy that applies user identity.
- Define supported OpenShift versions and whether plugin enablement may be automated by the operator or must remain an administrator action.
- Decide if infrastructure nodes represent configured endpoints, live health, or both; the current gateway has no general probing contract for user-owned systems.
- Confirm whether “operational” should later include suspend/resume/cancel, with a separate permission and audit model.

## Standards and references

- [OpenShift dynamic plugins](https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/web_console/dynamic-plugins) — custom navigation/pages, `ConsolePlugin`, service proxy, and `consoleFetch` integration.
- [OpenShift Console dynamic plugin SDK](https://github.com/openshift/console/tree/main/frontend/packages/console-dynamic-plugin-sdk) — plugin APIs and compatibility guidance.
- [Open Workflow Editor](https://github.com/open-workflow-specification/editor) — shared embeddable workflow editing UI.
- [OpenAPI](https://spec.openapis.org/oas/latest.html) — keep the gateway’s HTTP contract discoverable and generate typed clients where practical.
- [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/) — reuse common names for status, traces, metrics, and messaging signals.
