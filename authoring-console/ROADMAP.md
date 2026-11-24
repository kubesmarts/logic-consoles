# Authoring Console release roadmap

Milestones track user-visible outcomes. Packets A–H in the [implementation plan](PLAN.md#parallel-implementation) assign code ownership. A packet can contribute to several milestones. Use the [design specification](DESIGN.md) for screen acceptance and the [architecture record](adr/0001-authoring-console.md) for API and identity decisions.

| Milestone | Gate depends on | Lead and contributors | Status |
| --- | --- | --- | --- |
| M1 · Shared shell and contracts | Planning baseline available in the implementation checkout | A with B and H | Ready to start |
| M2 · First live publish and run | M1 | B with A, C, E and G | Planned |
| M3 · Platform and runtime setup | M2 | D with B and C | Planned |
| M4 · Complete authoring and publication | M2 | E with A, C and G | Planned |
| M5 · Topology, instance history and lifecycle controls | M3 and M4 | F with D, E, G and H | Planned |
| M6 · Operator-aligned release | M5 and a released operator tag | H with A and B | Planned |

**How to use the gates.** The table governs integration. Once M1 lands, agents can build later screens against the shared fixtures while M2 proves the live path. M3 and M4 can pass independently. To mark a gate passed, the lead links the integrated commit and its test run or reproducible demo in that milestone’s row. For a live gate, include the cluster profile and operator revision. A failed check stays with its owning packet while independent work continues.

### M1 · Give agents a common starting point

Make the plan, ADR, design and agent guidance available on the shared implementation branch before dispatch to separate worktrees. A owns the TypeScript workspace, lockfile, PatternFly shell and workflow list/detail reference screens. A and B agree the typed boundary for session/context, capabilities, resource and version identities, dry-run, writes, status and gateway reads/runs. H seeds fixtures from operator commit `b9a71660267f0cad794b95e010569b280a932da8`; it is the development baseline. H records each component’s observation source and fixtures for a matching running image digest, a tag-only observation, an unknown digest and insufficient permissions.

**First acceptance check — bundled frontend.** A builds the production React 19 and PatternFly 6 shell and opens the built assets in a browser. Load a workflow in Monaco, introduce a YAML schema error and verify the bundled YAML worker reports it. Fix the document and verify the embedded CNCF diagram reflects the edit. Navigate to a small React Flow topology in the same shell and verify it renders. Using only the keyboard, edit YAML, enter the CNCF diagram, navigate out and return to the YAML editor. Verify the edit survives and focus returns predictably. Record the tested editor version and any diagram limitations. Commit the working dependency pins and lockfile and record the smoke-test result before other UI packets adopt the stack. B can develop the launcher and H can prepare operator contracts in parallel.

**Pass when** a fresh checkout builds and type-checks the shell and runs a UI smoke test. From a fixture-backed workflow list, select a version and open its detail page. Capture the reference screens for design review. Both launcher and UI code compile against the same contract; fixture cases include forbidden writes, an unavailable gateway and a definition whose CR name differs from its workflow name.

### M2 · Prove the first live journey on stock KIND

Connect only the parts needed for this demo. B launches the bundled UI on loopback and uses the selected kubeconfig context. C and E supply definition review, server dry-run and create. G supplies a version-specific synchronous run with JSON input. Use the operator’s existing gateway-only KIND demo with ingress-nginx. [KIND quick start](docs/connect-kind.md)

**Pass when** the following journey succeeds from the launcher on a prepared, unmodified demo cluster.

1. Confirm the preselected context and `default` namespace. Discover the operator, `hello-runtime` and the gateway.
2. Open `hello-world` version `1.0.0`. Publish a second version through the UI to the same runtime. Verify both CRs and the original version’s contents.
3. Select the new version, send `{"name":"World"}` using **Run and wait**, and see `Hi, World!`. Verify the gateway request targets the selected version and execution uses the shared gateway with zero per-workflow LogicFlowService resources.
4. With both versions deployed, reopen `1.0.0` and run it. Check the actual outbound URL includes `1.0.0`. Cover both sync and async adapters with fixtures in which a missing or versionless execution link produces zero POSTs.
5. With Data Index disabled, the sync output stays visible. Simulate a lost start response and verify that the input survives, history is reported unavailable and exactly one POST is sent until the author explicitly starts a separate run. A separate gateway-unreachable check leaves permitted Kubernetes actions usable.

Exercise an occupied launcher port. Offer retry at the original address or an explicit override. Verify that a successfully selected override is reused on restart.

This gate establishes the launcher demo. The history-enabled environment first becomes necessary at M5.

### M3 · Let an administrator prepare a cluster and an author reuse it

D delivers the platform and runtime wizards on C’s shared full-CR editor. Cover PostgreSQL references and example guidance, optional Data Index and Vector, gateway ingress, and Ephemeral/PlatformDB runtime choices. Show reconciliation conditions after each write.

**Pass when** a cluster with missing operator APIs shows installation guidance and **Check again**. On an operator-installed cluster, use **Create namespace**, review its YAML, verify the core/v1 Namespace exists and create the platform targeting it. Create a runtime through the quick-run path. Exercise reuse with namespace creation denied and preserve the draft when admission rejects the namespace or another admin creates the same name first. Exercise the history-enabled setup with prepared PostgreSQL and verify component readiness. Toggle Form → YAML → Form, retain an advanced pod field, submit it and read it back. A user denied platform updates can reuse the existing runtime and publish a permitted definition. A denied or stale write preserves the draft.

Verify two independent admin sessions in M3:

- **Competing create.** Both begin with an empty platform list. A creates the platform before B submits. Exercise a same-name AlreadyExists response and a different-name singleton admission rejection. B retains the draft and can open the existing platform. Verify that B issues no update and A’s settings survive.
- **Stale update.** Both load the same platform revision. A changes and saves a setting. B’s stale write conflicts. Verify that B can compare against A’s saved revision, preserve A’s change, and dry-run and explicitly submit B’s selected edits using the fresh resourceVersion.

### M4 · Author, review and safely publish versions

E delivers blank and catalog-based authoring, pinned DSL completion, CNCF preview, workflow family/version navigation, draft save/resume and export. C supplies admitted diff and update handling. Use deterministic CR names for console-created versions and resolve hand-authored definitions by actual identity.

**Pass when** an author can tailor a catalog example, recover from invalid YAML, save a draft, stop and restart the launcher, reopen that draft in the same browser profile, and publish it. Returning to the original port after using an override restores access to drafts saved there. The default creates a new version on the family’s runtime. Explicit in-place update shows a diff and preserves the existing CR identity. Check a 63-character name, two long names sharing a prefix, a prerelease and a version the operator cannot store as a label. Two concurrent attempts to create the same version leave one successful create and a recoverable conflict. A fixture with two differently named CRs claiming one workflow version surfaces ambiguity and prevents an ambiguous update or run. Check keyboard operation and the narrow editor layout against the design spec.

### M5 · Inspect and control a running instance

F and G integrate the topology graph and accessible list, deployed workflow diagram, version-filtered instance history, schema-driven Run form and raw JSON fallback. Use a second KIND profile with PostgreSQL, Data Index, Vector watching the runtime namespace, and runtime structured logging. Provision the required components individually or omit the per-workflow LogicFlowService from the operator persistence sample.

**Pass when** an author selects a deployed version from topology, starts it asynchronously with schema-generated input, sees its instance ID immediately, and later opens that same ID and version from gateway-backed history. Run the same version synchronously and inspect its output. Exercise raw JSON for a workflow without a schema, keyboard selection from the list, partial topology, delayed ingestion and unavailable Data Index. A timed-out start sends exactly one POST. With working Data Index, verify the known-ID detail and unknown-ID version-history paths, including delayed indexing. Retrying a failed history query issues only a read. Shared read views render in a minimal second host.

For lifecycle acceptance, start a long-running version and use the Authoring Console to suspend, resume and then cancel the same instance. Verify each version-specific POST, runner response and eventual indexed status where available. Dismissing cancellation sends zero requests. Cover denied access, a stale instance state and an ambiguous timeout with fixtures. The read-only host omits the action menu. [Gateway lifecycle integration test](https://github.com/kubesmarts/logic-operator/blob/b9a71660267f0cad794b95e010569b280a932da8/workflow-gateway/test/integration/gateway_runner_test.go#L162)

### M6 · Qualify and ship after the operator release

H pins the released CRDs, gateway OpenAPI, component images, DSL/editor and catalog revisions. A and B package the launcher with its assets, installation instructions and the compatibility page. Exercise the separate URL/token adapter on a prepared cluster. Use the [release evidence in the plan](PLAN.md#compatibility-and-release-evidence) for the full matrix.

**Pass when** the packaged build completes the clean KIND journeys and remote Kubernetes/OpenShift smoke checks with the intended identities and gateway exposure. Record the exact environments tested, restricted-author behavior and runner authorization failure. Verify the compatibility page matches the tested manifest, including digest-verified versions, observed tags, overrides and unknown versions. Verify that denied inspection leaves authoring available. Repeat the design spec’s keyboard journey on the packaged build and complete its light/dark and narrow-screen checks. A focus trap or an authoring task that requires a mouse blocks release. Publish the console artifact and matrix entry against the released operator tag.

**Decisions and timing.** M4 can use explicit draft saves and YAML export while autosave remains open. Choose the first supported operator tag and support window for M6. Per-user gateway authorization follows upstream support. The first release retains the gateway service-account model.
