# Authoring Console — One-Pager

**Status:** Proposal
**Date:** 2026-10-29
**Audience:** Product, platform, and frontend engineering

## Intent

Build the public web front end for the Logic Operator ecosystem at [start.kubsmarts.org](https://start.kubsmarts.org). It should take a user from an installed operator to a published workflow, then provide the shared operational views needed to inspect that cluster. The console does not install or upgrade Logic Operator.

## Primary user journey

1. **Connect a cluster.** Discover whether the operator and its CRDs are present, check access, and show copyable install instructions when they are absent. Support local KIND/Minikube as well as remote Kubernetes clusters.
2. **Set up the platform.** A guided form creates or updates `LogicPlatform` and `LogicFlowRuntime` resources and shows their reconciliation status. It explains prerequisites and accepts references to user-provided database and observability infrastructure; it does not provision Kafka, PostgreSQL, Jaeger, Prometheus, or Grafana.
3. **Author and publish.** Embed the official Open Workflow Editor React component. Validate an Open Workflow document, select its runtime target, preview the generated `LogicFlowDefinition`, and apply it to the connected cluster. Keep the workflow document portable and exportable.
4. **Operate and try it.** Reuse the Operational Console views for topology and instance history. Offer explicit workflow starts through the gateway’s HTTP API and an event-publishing form with editable event type and body.

## Product and technical shape

Use a hosted React application with a shared React package for gateway clients, API types, topology/instance views, and reusable workflow UI. Keep the web application shell responsible for cluster connection, onboarding, setup wizards, authoring, and launch actions. Keep the shared package independent of OpenShift Console APIs so the same views can run in the OpenShift plugin.

**Cluster connection is an architecture decision.** For local clusters and kubeconfig exec-plugin compatibility, prefer a user-run local connector that uses the user’s existing Kubernetes credentials and establishes a short-lived, paired connection to the hosted UI. Do not upload kubeconfig files or retain cluster credentials in browser storage. A direct browser-to-API option is viable only when the API is reachable and its auth, CORS, and short-lived credential flow are explicitly supported. Kubernetes documents that kubeconfig exec authentication runs a command on the client host and that its web authentication flow is not built into the API server.

The UI can create `LogicPlatform`, `LogicFlowRuntime`, and `LogicFlowDefinition` objects only with the connected user’s Kubernetes permissions. Show the exact resource changes and namespace before applying them. Never elevate permissions through a console-owned cluster-admin credential.

**Kafka launch needs a publisher bridge.** Kafka’s native client protocol is binary TCP; browser JavaScript cannot open arbitrary TCP sockets. Route event sends through a deliberate in-cluster or local publisher service rather than placing broker credentials in the web application. Prefer CloudEvents fields (`specversion`, `id`, `source`, `type`, optional `subject`/`time`, and `data`) while allowing users to edit `data` and supported extensions. The transport, auth, topic selection, and event-to-workflow routing contract remain design dependencies.

## MVP scope and success

- Connect to a cluster with the operator installed; detect missing CRDs/operator and give install guidance without installing it.
- Apply `LogicPlatform` and `LogicFlowRuntime` through guided forms and report readiness/errors.
- Edit, validate, and publish an Open Workflow as a `LogicFlowDefinition`.
- Display shared topology and query workflow instance history through the gateway.
- Start an HTTP workflow through the gateway. Add event launch once the publisher bridge and event contract are defined.

**Out of scope:** operator lifecycle management; provisioning Kafka, databases, or observability stacks; replacing GitOps/CI as the production delivery path; storing long-lived cluster or broker credentials.

## Decisions to settle

- Local connector versus direct browser access, and supported OS/install distribution.
- Whether the console writes directly to the Kubernetes API or goes through an authenticated per-cluster API service.
- Event publishing bridge, Kafka auth modes, topic discovery, and CloudEvents versus raw payload support.
- Whether workflow launch is a development-only convenience or a supported production operation, and which RBAC roles may launch.

## Standards and references

- [Open Workflow Editor](https://github.com/open-workflow-specification/editor) — official, vendor-neutral editor; its React component is intended for embedding.
- [Kubernetes authentication](https://kubernetes.io/docs/reference/access-authn-authz/authentication/) — client authentication and kubeconfig exec plugins.
- [Apache Kafka protocol](https://kafka.apache.org/38/design/protocol/) — native client protocol is binary over TCP.
- [Browser WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) — browsers expose WebSocket sessions rather than arbitrary TCP sockets to page code.
- [CloudEvents specification](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md) — interoperable event envelope and `data` payload.
- [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/) — align displayed trace, metric, and messaging terminology with existing observability systems.
