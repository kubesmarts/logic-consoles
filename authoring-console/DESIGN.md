# Authoring Console design specification

**Draft for review · 2026-11-20.** Use the OpenShift 4.20 web console as the interaction reference and PatternFly 6 React as the visual baseline. The version pins a design reference independently of the supported cluster versions. Our product name in the masthead is **Authoring Console**. The same interface serves KIND, Kubernetes and OpenShift. [OpenShift web console](https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html-single/web_console/index) · [Implementation plan](PLAN.md)

## The shell

Use one navigation tree for administrators and workflow authors. OpenShift’s unified navigation, resource lists, detail tabs and project selector are the conventions to carry over. Use **Namespace** throughout this console so the same instructions work on every cluster. The application owns its name and navigation. An embedded Operational Console view takes its surrounding shell from its host.

| Region | Placement and behavior |
| --- | --- |
| Masthead | Full-width PatternFly Masthead. Put the navigation toggle and product name at the start. Put the active kubeconfig context at the end. The context control opens connection details or switches cluster. Before connection it reads **Disconnected**. |
| Sidebar | Persistent on wide screens and collapsible via the masthead toggle. Highlight the active destination. Use **Platform**, **Runtimes**, **Workflows**, **Topology**, **Compatibility** in that order. A connected author lands on Workflows. A first-time admin with no platform gets the setup entry on Platform. |
| Scope | Put the namespace selector at the top of the content area on namespaced pages. Keep the current selection visible when navigating. Allow a known namespace to be entered when listing is forbidden. Platform shows **Cluster-scoped** and labels the managed namespace **Target namespace**. Compatibility shows the active cluster. |
| Page header | A collection has a plural title and a clearly named create action when permitted. A detail page has breadcrumbs back to the collection, the resource name as its heading, status beside it and an **Actions** menu for secondary operations. Follow with horizontal tabs where the resource has distinct views. |
| Main area | Use the full available width for operational tables, diagrams and editors. Constrain forms to a readable column. Keep the heading, toolbar and table aligned to the same page inset. On a detail route, browser Back restores the originating list’s namespace, filter and position. |

Use PatternFly Page, Masthead, Nav, Breadcrumb, Toolbar, Table, Tabs and Drawer for these regions. Use the shell’s single main landmark and skip link. [PatternFly page](https://pf6.patternfly.org/components/page/) · [PatternFly toolbar](https://www.patternfly.org/components/toolbar/)

## Visual language

- Use the installed PatternFly theme for typography, spacing, surfaces, borders, icons, control sizing and focus rings. Use semantic design tokens for custom editor and graph chrome. Keep token overrides in the shell theme so a runtime page and a workflow page use the same spacing and colors.
- Use a distinct masthead, a quieter navigation surface and a continuous content surface. Use compact, horizontally aligned rows for resources. Use description lists for metadata, a monospace face for YAML, JSON and IDs, and sentence case for headings, labels and buttons.
- Give a task one prominent primary action at a time. Use verb–object labels such as **Create runtime**, **Publish new version** and **Run and wait**. Put secondary actions in the local toolbar or Actions menu. Reserve status color for meaning and pair it with an icon and text. Keep the active row, selected tab and keyboard focus distinct.
- Honor light and dark themes across the shell, Monaco, the CNCF diagram and React Flow. Prefer component defaults over custom CSS. Use the same resource list layout in both themes. Keep names selectable and reveal a truncated identifier in full on keyboard focus as well as pointer interaction.

## Reference screen · deployed workflow version

This proposed layout uses example data. It shows the relationship between navigation, scope, resource identity and actions. PatternFly supplies the actual dimensions and typography.

```text
☰  Authoring Console                                  kind-logic-operator-dev ▾
──────────────────────────────────────────────────────────────────────────────
Workflows    │ Namespace  default ▾
Topology     │ Workflows / hello-world / 1.0.0
Runtimes     │
Platform     │ hello-world   1.0.0   ✓ Ready       [Run this version] [Actions ▾]
Compatibility│ Details   Diagram   YAML   Instance history
             │ ───────
             │ Runtime          hello-runtime
             │ Definition       hello-world-v1-0-0
             │ Namespace        default
```

The workflow list groups versions by effective namespace and document name. Give each family a name link, runtime link and version count. Opening the family shows its versions. Selecting a version establishes the target for Diagram, Run and Instance history. Show the Kubernetes CR name in Details so a user can locate it with kubectl. **YAML** on a resource detail shows the full CR. The authoring editor labels the portable document **Workflow YAML**. Keep the version visible while running or updating it.

## Screens and interactions

| Screen | Composition and primary interaction |
| --- | --- |
| Start | One short form with the current context preselected, namespace and **Connect**. Place URL/token under other connection options. Show separate Kubernetes and gateway connection results. An admin can continue to set up a missing gateway. |
| Platform and runtimes | Platform is a singleton details page. Use a description list for identity and target namespace and a table of configured components with readiness and reasons. Runtimes use a toolbar and resource table with name, persistence mode, ready replicas and status. Each name opens Details and YAML. At platform creation, place **Create namespace** beside the target selector for authorized users. Return focus and the created name to that selector on success. A read-only platform offers **Continue to workflows**. |
| Resource wizard | Use an in-page PatternFly Wizard with named steps, Back, Next and a final review with the target cluster, scope, change diff and create/update action. Keep **Form / YAML** visible throughout editing. Both views edit the same draft. Returning to Form preserves advanced pod fields. Invalid YAML keeps its text and line diagnostics. Place admission errors at the matching field and link to the YAML path. [PatternFly wizard guidance](https://www.patternfly.org/components/wizard/design-guidelines/) |
| Workflow creation | **Create workflow** opens a blank YAML editor with schema completion. Offer **Start from example** in that workspace. Choosing an example opens an editable draft with source attribution. Place the read-only CNCF preview beside the editor on wide screens and behind a **Diagram** tab on narrow screens. Mark a stale preview when the YAML is invalid. |
| Publication | In review, show the namespace, workflow name and version, the family’s single runtime, and the full definition YAML. For edits, **Publish new version** is primary. **Update existing version** requires an explicit choice and presents the deployed-to-draft diff. After submit, show reconciliation and gateway discovery as separate states. |
| Topology | Use React Flow for cluster resources and typed relationships from the gateway. Include a Graph / List switch and give both views the same selection behavior. Selecting a definition opens a side drawer with identity, status and a link to the deployed version. Keep selection while opening and closing the drawer. |
| Run and history | **Run this version** opens a panel showing namespace, name, version, input and execution mode. Generate PatternFly fields for supported schemas and offer JSON input. Sync displays output in the panel. Async displays the returned instance ID immediately. Instance history lists ID, status and available timestamps for the selected version. Selecting an ID opens details. Keep the run result visible if history is unavailable. |
| Instance actions | In Authoring Console instance detail, show **Suspend** for a running instance, **Resume** for a suspended instance, and **Cancel instance** for an active instance when the corresponding gateway link is available. Show terminal instances read-only. Confirm cancellation with namespace, workflow version and instance ID. Disable repeat submission while pending, announce the runner response and refresh history. If the instance has already changed state, show that outcome and its last observed status. |
| Compatibility | Use a compact table with component, tested version, observed image or version, and source. Label digest matches as verified, show tag-only observations as such, and distinguish insufficient access from an observed override. Include console and operator release identity in the page header or description list. |

## Feedback states

Use an inline alert near the failed operation for actionable errors, an empty state for an empty collection, and field helper text for input errors. Brief success notifications can supplement persistent resource status. Preserve the draft or current selection across retries. [PatternFly empty state](https://pf6.patternfly.org/components/empty-state/)

| Observed state | What the user sees |
| --- | --- |
| Operator APIs missing | **Operator setup required**, link to installation instructions and **Check again**. A discovery 403 instead identifies the capability the user could not inspect. |
| No workflows in an accessible namespace | Name the namespace and offer **Create workflow** if permitted. When filters exclude all rows, offer **Clear filters**. |
| Submitted, still reconciling | Show **Submitted** immediately, then the current operator condition and reason. Enable Run once the selected version is routable and the gateway is available. |
| Gateway unreachable or topology partial | Identify the affected connection or discovery source. Offer **Retry**, keep available nodes visible and leave Kubernetes publishing usable. |
| History disabled, pending or failed | Explain disabled indexing, show an accepted instance awaiting ingestion, or report the query failure as appropriate. Keep a successful sync output intact. |
| Platform created during setup | Keep the draft and offer **View existing platform**. For a stale edit, show the live platform beside the draft and let the admin choose which changes to reapply before review. |
| Stale edit or unknown run outcome | Preserve the draft and offer comparison for a conflict. For a timed-out start, retain the input. With indexing disabled, explain that history is unavailable and offer **Start another run** as a separate execution. With indexing available, offer **View instance** for a known ID or **View version history** otherwise. Use **Retry history** for a temporary indexing outage. |

## Design acceptance

The shell owner maintains the page frame, theme and reference layouts. Feature owners use those layouts and contribute review evidence for their screens. Review the first workflow list and version detail together before applying the patterns across the remaining work packets.

1. On a desktop viewport, a reviewer can identify cluster, namespace, selected resource/version and primary action without opening a menu. Switching between Runtimes and Workflows preserves the masthead, sidebar and content alignment.
2. At 360 CSS pixels wide, the sidebar collapses, editors switch to tabs, and the action and active scope remain reachable. Limit horizontal scrolling to content that needs it, such as a table or code region. Check the same journey with browser zoom at 200%.
3. Using only a keyboard, connect, select a version, open Run, submit and inspect its result. Closing Run returns focus to its trigger. Give every field a persistent label, announce async status changes and connect validation messages to their fields. Graph and list views both lead to the same detail page.
4. Round-trip an advanced YAML field through a wizard. Switch a workflow draft between editor and diagram. Use only the keyboard to enter and leave the CNCF diagram, then return to YAML. Focus returns predictably and the draft survives each switch. A focus trap or a mouse-only authoring task blocks release. For an inaccessible diagram interaction with an equivalent keyboard-accessible YAML path, verify that the same information and task are available there, document the limitation for users and report it upstream.
5. Capture desktop light and dark screenshots of the reference detail screen and a narrow-screen capture of the editor for review. Exercise read-only platform access, partial topology and unavailable history with fixtures. Captures should show which actions remain available in each case.
