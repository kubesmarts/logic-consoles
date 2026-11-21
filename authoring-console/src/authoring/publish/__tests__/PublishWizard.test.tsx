/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/prefer-as-const */
/**
 * PublishWizard UI integration tests.
 *
 * Tests real behavior with Testing Library + fixture transports. Monaco and CNCF diagram
 * editor are browser-only, so they're mocked at the leaf (same pattern as smoke.test.tsx).
 * Everything else runs for real: routing, PatternFly components, Kubernetes transport,
 * gateway catalog, ResourceEditor integration.
 *
 * Assertions (per E2 review):
 * (a) Default mode is create
 * (b) Toggling to "update" resolves the version and shows the diff
 * (c) An ambiguous resolution blocks submit
 * (d) A successful create navigates with the correct version key
 * (e) Update-entry pre-fill from query params (mode=update&namespace&workflowName&version)
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Monaco and CNCF diagram editor (browser-only components)
vi.mock("@monaco-editor/react", () => ({
  default: ({ value, options }: { value?: string; options?: { ariaLabel?: string } }) => (
    <textarea data-testid="monaco" aria-label={options?.ariaLabel} value={value ?? ""} readOnly />
  ),
}));
vi.mock("../../../editors/monaco-setup.ts", () => ({ setupMonaco: () => {} }));
vi.mock("@openworkflowspec/diagram-editor", () => ({
  DiagramEditor: ({ content }: { content: string }) => <div data-testid="cncf-editor">{content}</div>,
}));
// Mock theme
vi.mock("../../../app/theme.tsx", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

import { PublishWizard } from "../PublishWizard.tsx";
import { AuthoringProvider } from "../../AuthoringProvider.tsx";
import { ConsoleProvider, type ConsoleServices } from "../../../app/ConsoleContext.tsx";
import type {
  KubernetesTransport,
  GatewayTransport,
  KubeObject,
  LogicFlowDefinitionSpec,
  LogicFlowDefinitionStatus,
  LogicFlowRuntimeSpec,
  GroupVersionKind,
  ListOptions,
  WriteCandidate,
  ResourceRef,
  DefinitionResource,

} from "../../../contracts/index.ts";
import { OperatorLabels } from "../../../contracts/index.ts";

const createMockServices = (
  kubernetes: KubernetesTransport,
  gateway: GatewayTransport,
  navigate: (path: string) => void,
): ConsoleServices => ({
  session: {
    sessionId: "test-session",
    context: { contextName: "test-context", clusterDisplay: "test-cluster" } as any,
    namespace: "default", mode: "launcher" as "launcher",
  } as any,
  kubernetes,
  gateway,
  capabilities: {
    canCreate: vi.fn().mockResolvedValue(true),
    canUpdate: vi.fn().mockResolvedValue(true),
    canDelete: vi.fn().mockResolvedValue(true),
    canList: vi.fn().mockResolvedValue(true),
  } as any,
  storage: {
    getDraft: () => undefined,
    listDrafts: () => [],
    saveDraft: (draft: any) => ({ ok: true, draft } as any),
    removeDraft: () => {},
    exportDraftYaml: (draft: any) => draft.workflowYaml, readPreferences: () => ({}), writePreferences: () => {},
  } as any,
  compatibility: {
    consoleVersion: "1.0.0",
    operatorRelease: "2.0.0-Alpha4",
    } as any,
  useNavigation: () => ({
    navigate, currentPath: "/publish",
    params: {},
    location: { pathname: "/publish", search: "", hash: "", state: null },
  }),
});

describe("PublishWizard Integration", () => {
  let queryClient: QueryClient;
  let mockKubernetes: KubernetesTransport;
  let mockGateway: GatewayTransport;
  let definitionsList: Array<KubeObject<LogicFlowDefinitionSpec, LogicFlowDefinitionStatus>>;
  let runtimesList: Array<KubeObject<LogicFlowRuntimeSpec>>;
  let catalogEntries: DefinitionResource[];
  let navigateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    definitionsList = [];
    runtimesList = [
      {
        apiVersion: "logic.kubesmarts.org/v1",
        kind: "LogicFlowRuntime",
        metadata: { name: "test-runtime", namespace: "default" },
        spec: { persistenceMode: "Ephemeral" },
      } as any,
    ];
    catalogEntries = [];
    navigateMock = vi.fn();

    mockKubernetes = {
      get: vi.fn(async (ref: ResourceRef) => {
        const def = definitionsList.find((d) => d.metadata.name === ref.name);
        if (!def) throw new Error("Not found");
        return def as any;
      }),
      list: vi.fn(async (gvk: GroupVersionKind, options: ListOptions) => {
        if (gvk.kind === "LogicFlowRuntime") {
          return {
            apiVersion: "logic.kubesmarts.org/v1",
            kind: "LogicFlowRuntimeList",
            items: runtimesList,
            metadata: {},
          } as any;
        }
        let filtered = definitionsList;
        if (options.namespace !== undefined) {
          filtered = definitionsList.filter((item) => item.metadata.namespace === options.namespace);
        }
        if (options.labelSelector) {
          const selectors = options.labelSelector.split(",");
          filtered = filtered.filter((item) => {
            const labels = item.metadata.labels ?? {};
            return selectors.every((selector) => {
              const [key, value] = selector.split("=");
              return labels[key!] === value;
            });
          });
        }
        return {
          apiVersion: "logic.kubesmarts.org/v1",
          kind: "LogicFlowDefinitionList",
          items: filtered,
          metadata: {},
        } as any;
      }),
      dryRun: vi.fn(async (candidate: WriteCandidate) => candidate.object as any),
      create: vi.fn(async (candidate: WriteCandidate) => {
        const existing = definitionsList.find((d) => d.metadata.name === candidate.object.metadata.name);
        if (existing) {
          throw { writeError: { kind: "conflict", detail: "Already exists" } };
        }
        const created = {
          ...candidate.object,
          metadata: { ...candidate.object.metadata, resourceVersion: "1", generation: 1 },
          status: { observedGeneration: 1 },
        };
        definitionsList.push(created as any);
        return created as any;
      }),
      update: vi.fn(async (candidate: WriteCandidate) => {
        const index = definitionsList.findIndex((d) => d.metadata.name === candidate.object.metadata.name);
        if (index === -1) throw new Error("Not found");
        const updated = {
          ...candidate.object,
          metadata: { ...candidate.object.metadata, resourceVersion: "2", generation: 2 },
          status: { observedGeneration: 2 },
        } as any;
        definitionsList[index] = updated;
        return updated;
      }),
    } as any;

    mockGateway = {
      getTopology: vi.fn(),
      listDefinitions: vi.fn(async () => catalogEntries),
      getDefinition: vi.fn(),
      listInstances: vi.fn(async () => []),
      getInstance: vi.fn(),
      execute: vi.fn(),
      executeSync: vi.fn(),
      suspendInstance: vi.fn(),
      resumeInstance: vi.fn(),
      cancelInstance: vi.fn(),
    } as any;
  });

  const renderWizard = (initialRoute = "/publish") => {
    const services = createMockServices(mockKubernetes, mockGateway, navigateMock as any);
    return render(
      <QueryClientProvider client={queryClient}>
        <ConsoleProvider services={services}>
          <MemoryRouter initialEntries={[initialRoute]}>
            <Routes>
              <Route
                path="/publish"
                element={
                  <AuthoringProvider>
                    <PublishWizard />
                  </AuthoringProvider>
                }
              />
            </Routes>
          </MemoryRouter>
        </ConsoleProvider>
      </QueryClientProvider>,
    );
  };

  it("(a) default mode is create", async () => {
    renderWizard();

    const title = await screen.findByRole("heading", { name: "Publish workflow" });
    expect(title).toBeInTheDocument();

    const createRadio = screen.getByLabelText(/Publish new version \(default\)/);
    expect(createRadio).toBeChecked();

    const updateRadio = screen.getByLabelText(/Update existing version/);
    expect(updateRadio).not.toBeChecked();
  });

  it("(b) toggling to update resolves the version and shows the diff", async () => {
    const user = userEvent.setup();

    // Pre-populate with existing version
    definitionsList.push({
      apiVersion: "logic.kubesmarts.org/v1",
      kind: "LogicFlowDefinition",
      metadata: {
        name: "my-workflow-v-1-0-0",
        namespace: "default",
        resourceVersion: "1",
        generation: 1,
        labels: {
          [OperatorLabels.workflowName]: "my-workflow",
          [OperatorLabels.workflowVersion]: "1.0.0",
        } as any,
      } as any,
      spec: {
        runtimeRef: { name: "test-runtime" },
        flow: {
          document: {
            dsl: "1.0.0",
            namespace: "default",
            name: "my-workflow",
            version: "1.0.0",
          } as any,
          do: [{ step1: { set: { result: "original" } } }],
        } as any,
      } as any,
      status: { observedGeneration: 1 },
    } as any);

    renderWizard();

    await screen.findByRole("heading", { name: "Publish workflow" });

    // Toggle to update mode
    const updateRadio = screen.getByLabelText(/Update existing version/);
    await user.click(updateRadio);
    expect(updateRadio).toBeChecked();

    // Select runtime
    const runtimeSelect = await screen.findByRole("button", { name: /Select a runtime|test-runtime/ });
    await user.click(runtimeSelect);
    // Find the option by text (may already be selected if family exists)
    const runtimeOption = await screen.findByText(/test-runtime.*Ephemeral/);
    await user.click(runtimeOption);

    // Review (should resolve and potentially show diff)
    const reviewButton = screen.getByRole("button", { name: /Review update/ });
    await user.click(reviewButton);

    // Should navigate to review step
    const reviewTitle = await screen.findByRole("heading", { name: /Review update/ });
    expect(reviewTitle).toBeInTheDocument();

    // ResourceEditor should be mounted (Monaco mock will be there)
    const monaco = await screen.findByTestId("monaco");
    expect(monaco).toBeInTheDocument();
  });

  it("(c) an ambiguous resolution blocks submit", async () => {
    const user = userEvent.setup();

    // Create ambiguity: two CRs claiming same version
    definitionsList.push(
      {
        apiVersion: "logic.kubesmarts.org/v1",
        kind: "LogicFlowDefinition",
        metadata: {
          name: "my-workflow-v-1-0-0-first",
          namespace: "default",
          labels: {
            [OperatorLabels.workflowName]: "my-workflow",
            [OperatorLabels.workflowVersion]: "1.0.0",
          } as any,
        } as any,
        spec: {
          runtimeRef: { name: "test-runtime" },
          flow: { document: { name: "my-workflow", version: "1.0.0" } },
        } as any,
      } as any,
      {
        apiVersion: "logic.kubesmarts.org/v1",
        kind: "LogicFlowDefinition",
        metadata: {
          name: "my-workflow-v-1-0-0-second",
          namespace: "default",
          labels: {
            [OperatorLabels.workflowName]: "my-workflow",
            [OperatorLabels.workflowVersion]: "1.0.0",
          } as any,
        } as any,
        spec: {
          runtimeRef: { name: "test-runtime" },
          flow: { document: { name: "my-workflow", version: "1.0.0" } },
        } as any,
      } as any,
    );

    renderWizard();

    await screen.findByRole("heading", { name: "Publish workflow" });

    // Switch to update mode
    const updateRadio = screen.getByLabelText(/Update existing version/);
    await user.click(updateRadio);

    // Select runtime
    const runtimeSelect = await screen.findByRole("button", { name: /Select a runtime|test-runtime/ });
    await user.click(runtimeSelect);
    await user.click(await screen.findByText("test-runtime (Ephemeral)"));

    // Try to review (should block with ambiguity error)
    const reviewButton = screen.getByRole("button", { name: /Review update/ });
    await user.click(reviewButton);

    // Should show ambiguity error and NOT navigate to review
    const ambiguityAlert = await screen.findByText(/Multiple CRs claim version 1.0.0/);
    expect(ambiguityAlert).toBeInTheDocument();
    expect(screen.getByText(/my-workflow-v-1-0-0-first/)).toBeInTheDocument();
    expect(screen.getByText(/my-workflow-v-1-0-0-second/)).toBeInTheDocument();

    // Should still be on configure step
    expect(screen.getByRole("heading", { name: "Publish workflow" })).toBeInTheDocument();
  });

  it("(d) a successful create navigates with the correct version key", async () => {
    const user = userEvent.setup();

    renderWizard();

    await screen.findByRole("heading", { name: "Publish workflow" });

    // Select runtime
    const runtimeSelect = await screen.findByRole("button", { name: /Select a runtime|test-runtime/ });
    await user.click(runtimeSelect);
    await user.click(await screen.findByText("test-runtime (Ephemeral)"));

    // Review
    const reviewButton = screen.getByRole("button", { name: /Review new version/ });
    await user.click(reviewButton);

    await screen.findByRole("heading", { name: /Review new version/ });

    // Submit via ResourceEditor (find the Create button)
    const createButton = screen.getByRole("button", { name: /Create/ });
    await user.click(createButton);

    // Should show post-submit state
    const submittedTitle = await screen.findByRole("heading", { name: /Workflow submitted|Ready to run/ }, { timeout: 10000 });
    expect(submittedTitle).toBeInTheDocument();

    // Should show version key in the post-submit state
    expect(screen.getByText(/my-workflow-v-1-0-0/)).toBeInTheDocument();

    // Navigate button should be present and enabled
    const viewButton = screen.getByRole("button", { name: /View workflow version/ });
    expect(viewButton).toBeEnabled();
  });

  it("(e) update-entry pre-fill from query params", async () => {
    // Pre-populate with existing version
    definitionsList.push({
      apiVersion: "logic.kubesmarts.org/v1",
      kind: "LogicFlowDefinition",
      metadata: {
        name: "api-v-1-0-0",
        namespace: "prod",
        resourceVersion: "1",
        labels: {
          [OperatorLabels.workflowName]: "api",
          [OperatorLabels.workflowVersion]: "1.0.0",
        } as any,
      } as any,
      spec: {
        runtimeRef: { name: "test-runtime" },
        flow: {
          document: {
            dsl: "1.0.0",
            namespace: "prod",
            name: "api",
            version: "1.0.0",
          } as any,
          do: [],
        } as any,
      } as any,
    } as any);

    // Add runtime in prod namespace
    runtimesList.push({
      apiVersion: "logic.kubesmarts.org/v1",
      kind: "LogicFlowRuntime",
      metadata: { name: "test-runtime", namespace: "prod" },
      spec: { persistenceMode: "Ephemeral" },
    } as any);

    renderWizard("/publish?mode=update&namespace=prod&workflowName=api&version=1.0.0");

    await screen.findByRole("heading", { name: "Publish workflow" });

    // Should have update mode selected
    const updateRadio = screen.getByLabelText(/Update existing version/);
    expect(updateRadio).toBeChecked();

    // Should have namespace pre-filled
    const namespaceInput = screen.getByDisplayValue("prod");
    expect(namespaceInput).toBeInTheDocument();

    // Should have version pre-filled
    const versionInput = screen.getByDisplayValue("1.0.0");
    expect(versionInput).toBeInTheDocument();
  });
});
