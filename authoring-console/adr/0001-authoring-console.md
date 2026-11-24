# ADR 0001 · Authoring Console architecture

**First-release delivery, networking, storage, onboarding, identity and publishing decisions accepted · 2026-11-20.** Other implementation choices remain proposals. This record extends the repository's [Authoring Console one-pager](../../adr/2026-10-29-authoring-console-one-pager.md) and shares operational views with the proposed [OpenShift console](../../adr/2026-10-29-operational-console-one-pager.md). Product choices awaiting an answer are recorded in the [implementation plan](../PLAN.md).

## Two APIs behind one user journey

The Kubernetes API owns desired state. Read and write `logic.kubesmarts.org/v1` resources using the connected user's identity. Use the API server's admission, defaulting, concurrency checks and status conditions. The Workflow Gateway owns deployed workflow discovery, topology, invocation and access to Data Index history. A successful Kubernetes write, a reconciled resource, a routable workflow and an indexed execution are four distinct UI states.

| User action | Contract | Design consequence |
| --- | --- | --- |
| Discover installation | Kubernetes API discovery for the group/version and served resource kinds, optionally CRDs and controller Deployment when readable | Distinguish missing APIs, partial installation, forbidden discovery, unreachable API and unhealthy operator. A served CRD alone provides no controller health signal. |
| Prepare target namespace | Cluster-scoped core/v1 Namespace creation using the caller’s credentials | On initial setup, select an existing namespace or explicitly create one through a separate reviewed write. Platform and namespace creation require independent permissions. |
| Configure platform | Cluster-scoped singleton `ClusterLogicPlatform` with immutable `spec.targetNamespace` | Find the existing platform first. Its target namespace hosts managed services. Runtime namespaces may differ. |
| Configure runtime | Namespaced `LogicFlowRuntime` with optional `platformRef.name` and `persistenceMode` | Select the existing platform explicitly on the guided path. The operator supports Ephemeral and PlatformDB. |
| Publish | Namespaced `LogicFlowDefinition` holds `spec.flow` and exactly one `spec.runtimeRef.name` | A workflow family is keyed by Kubernetes namespace and workflow document name. All versions share a runtime in that namespace. Runtime reference and workflow name are immutable on update. Admission normalizes the document namespace to the CR namespace. |
| Inspect a deployment | `GET /v1/topology?namespace=…`, gateway definitions catalog and its `self` link | Render the topology graph with React Flow. Render the workflow document inside a selected definition with the CNCF editor. Use the actual CR name to edit its Kubernetes envelope. |
| Inspect history | Catalog `instances` link for namespace, workflow name and version, then `GET /v1/instances/{id}` | Data Index sits behind the gateway. An unavailable index has its own state. Execution can still work. |
| Control an instance | Definition catalog links `suspend`, `resume`, `cancel` each template the instance ID | The authoring host submits a version-specific POST to the gateway. The runner enforces authorization and state transitions. |
| Execute a selected version | Catalog `execute` and `executeSync` links | The async operation is a POST to `/v1/runtime/{namespace}/{name}/{version}`. Sync adds `/sync`. Send the workflow input as the JSON body. An async 202 carries an instance ID. A sync 200 carries the runner response including workflow output. |

The baseline for this inspection is operator commit `b9a71660267f0cad794b95e010569b280a932da8`. Its definition detail handler encodes `spec.flow` despite OpenAPI prose describing the full CR. For editing, resolve the catalog identity using the gateway reader’s namespaced lookup by workflow name and version labels, then read the full CR from Kubernetes by its actual object name. [Gateway definition reader](https://github.com/kubesmarts/logic-operator/blob/b9a71660267f0cad794b95e010569b280a932da8/workflow-gateway/internal/definitions/reader.go#L40-L58) Verify this behavior against the selected release. [Gateway OpenAPI](https://github.com/kubesmarts/logic-operator/blob/b9a71660267f0cad794b95e010569b280a932da8/workflow-gateway/internal/server/openapi.yaml) · [Gateway handlers](https://github.com/kubesmarts/logic-operator/blob/b9a71660267f0cad794b95e010569b280a932da8/workflow-gateway/internal/server/server.go) · [Definition admission](https://github.com/kubesmarts/logic-operator/blob/b9a71660267f0cad794b95e010569b280a932da8/api/v1/logicflowdefinition_webhook.go)

## Connection and identity

Build one React frontend and distribute the same static assets with the launcher and on a static web host. Share the workflow screens and API contracts. The Start page selects the connection flow for its environment. This decision supersedes the hosted pairing proposal in the October one-pager.

### Local launcher (accepted)

After a one-time install, the user launches the console, sees the current kubeconfig context preselected, and chooses **Connect**. A Node.js launcher written in TypeScript serves the bundled React UI and a same-origin API on loopback. It uses the selected kubeconfig context, including its CA, client certificate or credential plugin, for Kubernetes requests. It discovers the platform’s gateway address and calls it over the workstation’s network. A remote Kubernetes context or an OpenShift context from `oc login` uses the same flow. Keep runner credentials separate. The browser receives context names, application data and status. The Kubernetes credential stays in the local process. This design works with an ordinary KIND kubeconfig and the operator's existing demo ingress. No project-operated backend is involved.

Package the frontend assets and local API together as a launcher that opens the default browser. Bind to loopback, validate Host and Origin, and tie requests to a local launch session and selected context. Limit forwarding to supported operations and the selected destinations. A context change invalidates pending writes. Prove the prototype on the operator's stock KIND demo with discovery, a dry-run write and a sync call. Include a restricted context and a gateway-unreachable case. Use a stable loopback origin across launches, including scheme, hostname and default port. If binding the selected port fails because it is occupied, show the address and offer to retry or explicitly select another port. Explain that drafts belong to each address. Persist the override in local launcher preferences after a successful bind and allow the user to return to the original port.

Headlamp desktop demonstrates kubeconfig reuse. Minikube demonstrates the single-command browser launch. [Headlamp desktop authentication](https://headlamp.dev/blog/2026/05/15/kubernetes-dashboard-migration/) · [Minikube dashboard](https://minikube.sigs.k8s.io/docs/handbook/dashboard/)

### Direct browser mode for prepared clusters

Keep URL + short-lived token as an optional connection mode for prepared clusters. A typical deployment serves the assets on a customer intranet. A user on the customer network or VPN reaches the internal OpenShift API and gateway Route from their browser. The web host only delivers assets. In that mode the static UI calls the configured API directly, holds the token in session memory and sends it only to the selected Kubernetes origin. Both endpoints need browser-trusted certificates and cross-origin support where applicable. Keep this setup guidance with the manual connection option. [Manual browser setup](../docs/direct-browser-kind.md)

### Gateway discovery and access

Kubernetes and KIND require the installed `ingress-nginx` controller serving the Workflow Gateway Ingress. Gateway API integration follows operator support in a later release. OpenShift uses the operator-managed gateway Route. Verify gateway reachability from the launcher and validate its certificate when HTTPS is configured. An admin can configure the platform while its gateway is still pending. Publishing creates a definition bound to an in-cluster runtime. First-release CR editors cover platform, runtime and definition. Existing LogicFlowService objects may appear in topology. Workflow invocation uses the shared gateway. [Operator gateway exposure](https://github.com/kubesmarts/logic-operator/blob/b9a71660267f0cad794b95e010569b280a932da8/docs/antora/modules/ROOT/pages/components/workflow-gateway.adoc)

Show the active cluster before a write. Disconnect or cluster change clears in-memory credentials, pending requests, cached results and write confirmations. Restored drafts require explicit selection of their target before publishing.

| Operation | First-release identity and behavior |
| --- | --- |
| Discover, configure, publish | The launcher authenticates to Kubernetes with the selected kubeconfig context. Direct browser mode uses the supplied token. A cluster admin can complete every setup and authoring step. Check each capability independently and handle a 403 even after preflight. If an existing platform is visible to an author with read access, show it read-only and proceed to runtime selection. If platform discovery itself is forbidden, report that state and allow the author to use a known namespace and accessible runtime. |
| Inspect topology, definitions and history | Use the configured gateway. It uses its own service account for Kubernetes discovery and queries Data Index upstream. The service-account token stays with the gateway. The namespace picker scopes the displayed query. Results reflect the gateway's visibility and may include resources outside the user's Kubernetes permissions. |
| Run a workflow | Invoke its version-specific gateway link. The gateway proxies the call to the runner, which may require its own invocation credentials. Treat runner authorization failures as run errors. The ability to edit the platform is irrelevant to this action. |

When Data Index, runner and gateway support Kubernetes user authentication, negotiate that capability against the operator release and use the user's credentials through the gateway. The gateway will enforce namespace and operation permissions, including instance-by-ID access. Verify enforcement with two identities at that milestone. [Gateway behavior](https://github.com/kubesmarts/logic-operator/blob/b9a71660267f0cad794b95e010569b280a932da8/docs/antora/modules/ROOT/pages/components/workflow-gateway.adoc)

## Browser storage

Use browser localStorage for console-owned state. Proposed first records are UI preferences and workflow drafts the author saves on this device. Version the stored format, retain draft target context and support local removal and YAML export. A failed save should leave the draft in memory and offer export. Keep authentication material in memory for the session. Read deployed resources from Kubernetes and execution history from the gateway.

## First run

Recommend the history-enabled setup and offer a gateway-only quick run. Both lead to a synchronous example. Show workflow output directly from the gateway response. Offer instance history when the gateway can query its configured Data Index. Preserve the run result if indexing is delayed or the history query fails.

## Execution target

Release 1 pins every workflow start to the selected namespace, document name and version. Use the deployed version’s advertised `execute` or `executeSync` POST link and verify the target matches the version whose input form is open. A missing or mismatched link makes that mode unavailable. The versionless gateway routes are outside the console execution contract.

## Publication default

When editing a published workflow, **Publish new version** is the primary action. Suggest an unused version, let the author edit it and create a distinct definition on the family's existing runtime. **Update existing version** is a separate explicit choice with a deployed-to-draft diff and a resourceVersion check. A version collision keeps the draft open for another choice. It must never turn a create into an update.

### Suggested versions and generated CR names

For an existing stable family, suggest the next patch after the highest deployed stable SemVer. When extending a prerelease, increment its trailing numeric identifier (`1.3.0-rc.1` → `1.3.0-rc.2`) or append `.1` if it has none. Skip occupied suggestions and let the author edit. Validate the exact version both as SemVer and as an operator label value, including its 63-character limit. Report an unsupported value such as `1.2.3+build.7` at the version field. Keep the workflow document intact.

For a new definition, use `{name}-v-{major}-{minor}-{patch}` as the ordinary CR name. For example, `orders` at `1.2.3` becomes `orders-v-1-2-3`. Append prerelease identifiers with hyphen separators, so `1.3.0-rc.1` ends in `-v-1-3-0-rc-1`. Compute the suffix first and give the workflow prefix the remaining characters out of 63, counting every separator. Lowercase the generated name and trim trailing hyphens from a shortened prefix. Preserve the exact workflow name and version in the document.

For lossy cases, keep the suffix readable and include a short deterministic hash immediately before it. Use the first eight lowercase hexadecimal digits of SHA-256 over the UTF-8 JSON array of the exact namespace, workflow name and version (compact encoding). Reserve nine characters for the separator and hash when the prefix needs truncation, case folding changes the identity, or a prerelease identifier contains a literal hyphen that could be confused with a separator. If there is insufficient room for the suffix and a nonempty prefix under this rule, ask the author to supply a shorter CR name in YAML review. Show the final CR name before submission. Use create semantics and report any existing-object collision, including a hash collision. For edits, keep the object's actual name, including the operator sample’s `hello-world-v1-0-0`. Gateway identity remains the source for lookup.

## Frontend composition

Use TypeScript in strict mode and React. Use PatternFly for the shell, wizards, forms, tables and status messages. Embed `@openworkflowspec/diagram-editor` with `content`, `locale` and `isReadOnly` for the live YAML preview and deployed documents. Its current package guide requires React 19. Use `@xyflow/react` directly for cluster topology. The package and the shell must coexist in light and dark modes with working keyboard focus. [CNCF editor integration](https://github.com/open-workflow-specification/editor/tree/main/packages/open-workflow-diagram-editor) · [PatternFly](https://www.patternfly.org/get-started/develop/)

Propose Vite for the app, TanStack Query for request caching and invalidation, Monaco with monaco-yaml for schema-aware text editing, and the `yaml` document API for path-level edits. Evaluate a JSON Schema renderer with PatternFly controls and Ajv configured for the supported dialect. Select exact versions after a single integration spike covers React peer dependencies, editor CSS, YAML workers and keyboard use. Vitest, Testing Library, mocked HTTP via MSW and Playwright cover progressively wider boundaries.

Keep host-independent gateway types, query functions, topology and history views behind a shared entry point. Inject transport and navigation. The authoring host supplies Kubernetes writes, workflow starts and instance lifecycle actions. The Operational Console consumes read-only views. A future OpenShift plugin can consume the read views without depending on setup wizards, local connectivity or mutation code.

## Resource editing

Every guided resource editor owns one draft of the full user-editable CR. Seed edits from the live object. Forms patch only owned paths in the YAML document, retaining legal advanced fields, annotations, container settings and list entries. Every form supports full YAML review and edits before submission. Hold invalid YAML as text, show line diagnostics, and keep the last valid preview visibly stale. Recovering a valid draft restores form navigation. Remove server-managed fields from editable content and retain concurrency tokens separately. Show identity changes explicitly and apply the same kind, scope, namespace and runtime constraints in both modes.

Use strict field validation and server dry-run on the same create or update that will be submitted. Review the admitted changes, including defaults and namespace normalization. On update, require the loaded resourceVersion and handle 409 with reload, comparison and reapplication of the user's edits. Never silently overwrite a concurrent change. Present admission errors at the matching YAML path or form field. Watch or refetch conditions after submission, checking observed generation where available. [Kubernetes API semantics](https://kubernetes.io/docs/reference/using-api/api-concepts/)

## Release contract

Ship a console compatibility entry after verifying a released operator tag. Pin CRDs, gateway OpenAPI, runner behavior, DSL schema, catalog revision and editor version. A dependency bump that affects a contract changes its fixtures and matrix entry together. The compatibility page and CI should read the same versioned manifest. The plan describes release evidence and what to display when a component cannot be identified.
