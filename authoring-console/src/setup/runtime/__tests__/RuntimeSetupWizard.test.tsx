/**
 * Tests for RuntimeSetupWizard components.
 * Component-level tests for wizard steps (not full wizard rendering due to Monaco).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import type { RuntimeSetupDraft } from "../types.ts";
import { ModeSelectionStep } from "../steps/ModeSelectionStep.tsx";
import { BasicConfigStep } from "../steps/BasicConfigStep.tsx";
import { ReplicasAndLoggingStep } from "../steps/ReplicasAndLoggingStep.tsx";
import { SecurityStep } from "../steps/SecurityStep.tsx";
import { RuntimeReviewStep } from "../steps/RuntimeReviewStep.tsx";
import { ConsoleProvider, type ConsoleServices } from "../../../app/ConsoleContext.tsx";
import type { KubernetesTransport } from "../../../contracts/index.ts";

// Mock Monaco and editors
vi.mock("@monaco-editor/react", () => ({
  default: ({ value, options }: { value?: string; options?: { ariaLabel?: string } }) => (
    <textarea data-testid="monaco" aria-label={options?.ariaLabel} value={value ?? ""} readOnly />
  ),
}));
vi.mock("../../../editors/monaco-setup.ts", () => ({ setupMonaco: () => {} }));
vi.mock("../../../app/theme.tsx", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

const createMockKubernetes = (overrides?: Partial<KubernetesTransport>): KubernetesTransport => ({
  get: vi.fn(),
  list: vi.fn().mockResolvedValue({ items: [] }),
  create: vi.fn(),
  update: vi.fn(),
  dryRun: vi.fn(),
  ...overrides,
} as unknown as KubernetesTransport);

const createMockServices = (kubernetes: KubernetesTransport): ConsoleServices => ({
  session: {
    sessionId: "test-session",
    context: { contextName: "test-context", clusterDisplay: "test-cluster" },
    namespace: "workflows",
    mode: "launcher" as const,
  },
  kubernetes,
  gateway: {} as ConsoleServices["gateway"],
  capabilities: {
    canI: vi.fn().mockResolvedValue({ decision: "allowed" }),
  },
  storage: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
  compatibility: { consoleVersion: "1.0.0", operatorRelease: "2.0.0" },
  useNavigation: () => ({
    navigate: vi.fn(),
    currentPath: "/runtime/setup",
    params: {},
    location: { pathname: "/runtime/setup", search: "", hash: "", state: null },
  }),
} as unknown as ConsoleServices);

describe("ModeSelectionStep", () => {
  it("renders select-existing and create-new modes when user can create", () => {
    const draft: RuntimeSetupDraft = {
      mode: "select-existing",
      name: "",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
    };

    render(
      <ModeSelectionStep
        draft={draft}
        onChange={vi.fn()}
        existingRuntimes={[
          {
            apiVersion: "logic.kubesmarts.org/v1",
            kind: "LogicFlowRuntime",
            metadata: { name: "existing-runtime", namespace: "workflows" },
            spec: { persistenceMode: "Ephemeral" },
          },
        ]}
        canCreate={true}
      />,
    );

    expect(screen.getByText("Select or create runtime")).toBeInTheDocument();
    expect(screen.getByLabelText("Use existing runtime")).toBeInTheDocument();
    expect(screen.getByLabelText("Create new runtime")).toBeInTheDocument();
  });

  it("disables create mode when user cannot create", () => {
    const draft: RuntimeSetupDraft = {
      mode: "select-existing",
      name: "",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
    };

    render(
      <ModeSelectionStep
        draft={draft}
        onChange={vi.fn()}
        existingRuntimes={[
          {
            apiVersion: "logic.kubesmarts.org/v1",
            kind: "LogicFlowRuntime",
            metadata: { name: "existing-runtime", namespace: "workflows" },
            spec: {},
          },
        ]}
        canCreate={false}
      />,
    );

    expect(screen.getByText("Limited permissions")).toBeInTheDocument();
    expect(screen.getByLabelText("Create new runtime")).toBeDisabled();
  });

  it("shows runtime selection dropdown when select-existing mode is active", () => {
    const draft: RuntimeSetupDraft = {
      mode: "select-existing",
      name: "",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
    };

    render(
      <ModeSelectionStep
        draft={draft}
        onChange={vi.fn()}
        existingRuntimes={[
          {
            apiVersion: "logic.kubesmarts.org/v1",
            kind: "LogicFlowRuntime",
            metadata: { name: "runtime-1", namespace: "workflows" },
            spec: {},
          },
          {
            apiVersion: "logic.kubesmarts.org/v1",
            kind: "LogicFlowRuntime",
            metadata: { name: "runtime-2", namespace: "workflows" },
            spec: {},
          },
        ]}
        canCreate={true}
      />,
    );

    const select = screen.getByLabelText("Select existing runtime");
    expect(select).toBeInTheDocument();
  });

  it("calls onChange when mode is switched", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const draft: RuntimeSetupDraft = {
      mode: "select-existing",
      name: "",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
    };

    render(
      <ModeSelectionStep
        draft={draft}
        onChange={onChange}
        existingRuntimes={[]}
        canCreate={true}
      />,
    );

    await user.click(screen.getByLabelText("Create new runtime"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "create-new",
      }),
    );
  });
});

describe("BasicConfigStep", () => {
  it("renders runtime configuration form", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "my-runtime",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
    };

    render(
      <BasicConfigStep
        draft={draft}
        onChange={vi.fn()}
        platformName="cluster-platform"
        activeNamespace="workflows"
      />,
    );

    expect(screen.getByText("Configure runtime")).toBeInTheDocument();
    expect(screen.getByLabelText("Runtime name")).toHaveValue("my-runtime");
    expect(screen.getByLabelText("Runtime namespace")).toHaveValue("workflows");
  });

  it("displays both persistence modes", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "test-runtime",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
    };

    render(
      <BasicConfigStep
        draft={draft}
        onChange={vi.fn()}
        activeNamespace="workflows"
      />,
    );

    expect(screen.getByLabelText("Ephemeral (in-memory, no persistence)")).toBeInTheDocument();
    expect(screen.getByLabelText("PlatformDB (persistent storage)")).toBeInTheDocument();
  });

  it("shows PlatformDB dependency alert when PlatformDB is selected", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "db-runtime",
      namespace: "workflows",
      persistenceMode: "PlatformDB",
    };

    render(
      <BasicConfigStep
        draft={draft}
        onChange={vi.fn()}
        activeNamespace="workflows"
      />,
    );

    expect(screen.getByText("PlatformDB dependency")).toBeInTheDocument();
  });

  it("calls onChange when name is updated", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
    };

    render(
      <BasicConfigStep
        draft={draft}
        onChange={onChange}
        activeNamespace="workflows"
      />,
    );

    const nameInput = screen.getByLabelText("Runtime name");
    await user.type(nameInput, "new-runtime");

    expect(onChange).toHaveBeenCalled();
  });
});

describe("ReplicasAndLoggingStep", () => {
  it("renders replicas and logging configuration", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "test-runtime",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
    };

    render(
      <ReplicasAndLoggingStep
        draft={draft}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Replicas and logging")).toBeInTheDocument();
    expect(screen.getByLabelText("Number of replicas")).toBeInTheDocument();
    expect(screen.getByLabelText("Enable structured JSON logging")).toBeInTheDocument();
  });

  it("shows Vector watch warning when runtime is outside watched namespaces", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "test-runtime",
      namespace: "other-namespace",
      persistenceMode: "Ephemeral",
      structuredLogging: {
        enabled: true,
      },
    };

    render(
      <ReplicasAndLoggingStep
        draft={draft}
        onChange={vi.fn()}
        vectorWatchNamespaces={["workflows", "production"]}
      />,
    );

    expect(screen.getByText("Vector watch namespace warning")).toBeInTheDocument();
  });

  it("does not show Vector warning when runtime is in watched namespace", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "test-runtime",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
    };

    render(
      <ReplicasAndLoggingStep
        draft={draft}
        onChange={vi.fn()}
        vectorWatchNamespaces={["workflows"]}
      />,
    );

    expect(screen.queryByText("Vector watch namespace warning")).not.toBeInTheDocument();
  });

  it("shows payload options when structured logging is enabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "test-runtime",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
    };

    render(
      <ReplicasAndLoggingStep
        draft={draft}
        onChange={onChange}
      />,
    );

    const loggingCheckbox = screen.getByLabelText("Enable structured JSON logging");
    await user.click(loggingCheckbox);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredLogging: expect.objectContaining({
          enabled: true,
        }),
      }),
    );
  });
});

describe("SecurityStep", () => {
  it("renders all 3 security modes", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "test-runtime",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
    };

    render(
      <SecurityStep draft={draft} onChange={vi.fn()} />,
    );

    expect(screen.getByLabelText("NONE (development only)")).toBeInTheDocument();
    expect(screen.getByLabelText("API_KEY (machine-to-machine)")).toBeInTheDocument();
    expect(screen.getByLabelText("OIDC (enterprise SSO)")).toBeInTheDocument();
  });

  it("shows OIDC conditional form fields when OIDC is selected", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "test-runtime",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
      security: {
        type: "OIDC",
        oidc: {
          authServerUrl: "https://auth.example.com",
          clientId: "workflow-runtime",
          clientSecretName: "oidc-secret",
          clientSecretKey: "value",
        },
      },
    };

    render(
      <SecurityStep draft={draft} onChange={vi.fn()} />,
    );

    expect(screen.getByLabelText("OIDC auth server URL")).toBeInTheDocument();
    expect(screen.getByLabelText("OIDC client ID")).toBeInTheDocument();
    expect(screen.getByLabelText("OIDC client secret name")).toBeInTheDocument();
  });

  it("shows development warning alert when NONE is selected", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "test-runtime",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
      security: {
        type: "NONE",
      },
    };

    render(
      <SecurityStep draft={draft} onChange={vi.fn()} />,
    );

    expect(screen.getByText("Development mode")).toBeInTheDocument();
  });

  it("shows API key configuration alert when API_KEY is selected", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "test-runtime",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
      security: {
        type: "API_KEY",
        apiKey: {
          keys: [],
        },
      },
    };

    render(
      <SecurityStep draft={draft} onChange={vi.fn()} />,
    );

    expect(screen.getByText("API key configuration")).toBeInTheDocument();
  });
});

describe("RuntimeReviewStep", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it("renders select-existing mode as read-only view without ResourceEditor", () => {
    const draft: RuntimeSetupDraft = {
      mode: "select-existing",
      name: "existing-runtime",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
    };

    const existingRuntime = {
      apiVersion: "logic.kubesmarts.org/v1",
      kind: "LogicFlowRuntime",
      metadata: { name: "existing-runtime", namespace: "workflows" },
      spec: { persistenceMode: "Ephemeral" as const },
      status: { phase: "Running", replicas: 2, readyReplicas: 2 },
    };

    const kubernetes = createMockKubernetes();
    const services = createMockServices(kubernetes);

    render(
      <QueryClientProvider client={queryClient}>
        <ConsoleProvider services={services}>
          <RuntimeReviewStep
            draft={draft}
            onComplete={vi.fn()}
            onCancel={vi.fn()}
            selectExistingMode={true}
            existingRuntime={existingRuntime}
          />
        </ConsoleProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Confirm runtime selection")).toBeInTheDocument();
    expect(screen.getByText("existing-runtime")).toBeInTheDocument();
    expect(screen.getByText("Continue")).toBeInTheDocument();
    // Should NOT have Monaco editor in select-existing mode
    expect(screen.queryByTestId("monaco")).not.toBeInTheDocument();
  });

  it("renders create mode with ResourceEditor", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "new-runtime",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
    };

    const kubernetes = createMockKubernetes();
    const services = createMockServices(kubernetes);

    render(
      <QueryClientProvider client={queryClient}>
        <ConsoleProvider services={services}>
          <RuntimeReviewStep
            draft={draft}
            onComplete={vi.fn()}
            onCancel={vi.fn()}
          />
        </ConsoleProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Review and submit runtime configuration")).toBeInTheDocument();
    expect(screen.getByTestId("monaco")).toBeInTheDocument();
  });

  it("calls onComplete when Continue is clicked in select-existing mode", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const draft: RuntimeSetupDraft = {
      mode: "select-existing",
      name: "existing-runtime",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
    };

    const existingRuntime = {
      apiVersion: "logic.kubesmarts.org/v1",
      kind: "LogicFlowRuntime",
      metadata: { name: "existing-runtime", namespace: "workflows" },
      spec: { persistenceMode: "Ephemeral" as const },
    };

    const kubernetes = createMockKubernetes();
    const services = createMockServices(kubernetes);

    render(
      <QueryClientProvider client={queryClient}>
        <ConsoleProvider services={services}>
          <RuntimeReviewStep
            draft={draft}
            onComplete={onComplete}
            onCancel={vi.fn()}
            selectExistingMode={true}
            existingRuntime={existingRuntime}
          />
        </ConsoleProvider>
      </QueryClientProvider>,
    );

    await user.click(screen.getByText("Continue"));

    expect(onComplete).toHaveBeenCalled();
    // Verify create was NOT called (this is the CRITICAL fix verification)
    expect(kubernetes.create).not.toHaveBeenCalled();
  });
});
