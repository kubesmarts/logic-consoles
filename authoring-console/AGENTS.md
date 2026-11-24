# Working in authoring-console

Read the [implementation plan](PLAN.md) and [architecture record](adr/0001-authoring-console.md) before changing a feature. This directory is at the planning stage. The packets and paths in the plan define intended ownership. Product choices marked open are proposals until the maintainer records a decision.

## Taking a packet

- Identify the packet and [milestone gate](ROADMAP.md), upstream interface revision and acceptance scenario in your change. Own the paths listed for your packet. Coordinate a shared interface change with its owner and affected consumers first.
- The shell owner integrates routes, dependency versions and lockfile changes. Put the feature entry point and its tests in the feature's directory. Develop against the common fixtures until its live dependency is available.
- Keep cluster session identity, Kubernetes resource identity and workflow namespace/name/version explicit in interfaces. Key queries by session and relevant identity. Pass transport into shared views so they can also be used by the Operational Console.
- Pin contracts to the agreed operator release or explicitly named development commit. Use its CRD schemas, webhooks, gateway OpenAPI, implementation fixtures and runner integration tests. If two sources disagree, record a reproduction using fixtures and the observed behavior before changing a shared type.

For UI work, use the [design specification](DESIGN.md) for navigation, resource page layouts, PatternFly components, screen states and design review. The shell owner maintains shared patterns. Feature owners supply the screen evidence described there.

## Common implementation rules

- Use strict TypeScript, PatternFly controls and accessible names, field errors and keyboard paths. Use React Flow for the cluster graph and embed the CNCF diagram editor for workflow diagrams. Supply a list or text path for graph interactions.
- The default host is a local Node.js/TypeScript launcher serving the React bundle and same-origin API on loopback. Keep kubeconfig access and Kubernetes credentials in the launcher. Scope requests to the confirmed context and active launch session. Keep URL + token isolated in the optional direct-browser adapter. An unreachable gateway leaves Kubernetes actions usable.
- Keep platform write permission independent of workflow publishing and gateway actions. Gateway discovery uses the gateway service account in the first release. Namespace filters describe query scope. Per-user gateway enforcement is a later upstream capability. Validate advertised links against the selected origin and allowed operation. Keep credentials, Secret contents and workflow payloads out of logs, telemetry and fixtures.
- Use localStorage for console-owned state. Keep credentials and execution payloads out of persisted session data. Obtain history from the gateway when its Data Index is available. Show the first sync result directly from the response in either setup path.
- For Kubernetes and KIND, use `ingress-nginx` for the shared gateway. On OpenShift use its Route. Keep workflow runtimes internal and LogicFlowService read-only in topology.
- Use the shared CR editor for every form that writes a resource. Preserve advanced user fields across mode changes. Validate and dry-run the exact candidate. Surface forbidden access, field errors and version conflicts. Distinguish reconciliation from submission.
- Keep portable workflow YAML separate from Kubernetes metadata. Resolve the runtime family and version under the effective namespace. Default to creating a new version. Update a published CR only when the author explicitly selects that operation. A create conflict must retain that choice. Run and history actions target the selected deployed version.
- Represent absence, access denial, partial discovery and temporary failure explicitly. Handle a late response after cluster or namespace changes. Restrict automatic retries to safe reads.

## Handoff and verification

For each packet, report its public entry point, the fixtures and states it consumes, verified checks, and any dependency still simulated. Use the repository's actual package scripts once the shell lands. Include a focused regression for the packet's acceptance scenario, such as an advanced YAML round-trip, a version conflict, a partial topology or an async receipt preceding indexing. Integration evidence identifies the tested operator tag or commit and environment.

Keep changes in the assigned console scope. A needed operator, gateway or runner contract change belongs in the decision record as a dependency until the owning project ships it. Release claims come from the tested compatibility manifest.
