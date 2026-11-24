/**
 * Tests for RuntimesPage.
 * Tests rendering of runtimes list with name, persistence, ready replicas, status.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { KubernetesTransport } from "../../../contracts/index.ts";
import { ConsoleProvider, type ConsoleServices } from "../../ConsoleContext.tsx";
import { RuntimesPage } from "../RuntimesPage.tsx";

// Mock Monaco editor
vi.mock("@monaco-editor/react", () => ({
  default: ({ value, options }: { value?: string; options?: { ariaLabel?: string } }) => (
    <textarea data-testid="monaco" aria-label={options?.ariaLabel} value={value ?? ""} readOnly />
  ),
}));
vi.mock("../../../editors/monaco-setup.ts", () => ({ setupMonaco: () => {} }));
vi.mock("../../theme.tsx", () => ({
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
    context: {
      contextName: "test-context",
      clusterDisplay: "test-cluster",
    },
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
    currentPath: "/runtimes",
    params: {},
    location: { pathname: "/runtimes", search: "", hash: "", state: null },
  }),
} as unknown as ConsoleServices);

describe("RuntimesPage", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it("renders empty state when no runtimes exist", async () => {
    const kubernetes = createMockKubernetes({
      list: vi.fn().mockResolvedValue({ items: [] }),
    });
    const services = createMockServices(kubernetes);

    render(
      <QueryClientProvider client={queryClient}>
        <ConsoleProvider services={services}>
          <RuntimesPage />
        </ConsoleProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("No runtimes")).toBeInTheDocument();
    });
  });

  it("renders runtimes table with name, persistence, replicas, status", async () => {
    const kubernetes = createMockKubernetes({
      list: vi.fn().mockResolvedValue({
        items: [
          {
            apiVersion: "logic.kubesmarts.org/v1",
            kind: "LogicFlowRuntime",
            metadata: { name: "runtime-1", namespace: "workflows" },
            spec: { persistenceMode: "Ephemeral" },
            status: {
              phase: "Running",
              replicas: 2,
              readyReplicas: 2,
            },
          },
          {
            apiVersion: "logic.kubesmarts.org/v1",
            kind: "LogicFlowRuntime",
            metadata: { name: "runtime-2", namespace: "workflows" },
            spec: { persistenceMode: "PlatformDB" },
            status: {
              phase: "Pending",
              replicas: 1,
              readyReplicas: 0,
            },
          },
        ],
      }),
    });
    const services = createMockServices(kubernetes);

    render(
      <QueryClientProvider client={queryClient}>
        <ConsoleProvider services={services}>
          <RuntimesPage />
        </ConsoleProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("runtime-1")).toBeInTheDocument();
    });

    expect(screen.getByText("runtime-2")).toBeInTheDocument();
    expect(screen.getByText("Ephemeral")).toBeInTheDocument();
    expect(screen.getByText("PlatformDB")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByText("0 / 1")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renders Create runtime button", async () => {
    const kubernetes = createMockKubernetes();
    const services = createMockServices(kubernetes);

    render(
      <QueryClientProvider client={queryClient}>
        <ConsoleProvider services={services}>
          <RuntimesPage />
        </ConsoleProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Create runtime")).toBeInTheDocument();
    });
  });

  it("renders Details and YAML action links for each runtime", async () => {
    const kubernetes = createMockKubernetes({
      list: vi.fn().mockResolvedValue({
        items: [
          {
            apiVersion: "logic.kubesmarts.org/v1",
            kind: "LogicFlowRuntime",
            metadata: { name: "test-runtime", namespace: "workflows" },
            spec: { persistenceMode: "Ephemeral" },
            status: {
              phase: "Running",
              replicas: 1,
              readyReplicas: 1,
            },
          },
        ],
      }),
    });
    const services = createMockServices(kubernetes);

    render(
      <QueryClientProvider client={queryClient}>
        <ConsoleProvider services={services}>
          <RuntimesPage />
        </ConsoleProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("test-runtime")).toBeInTheDocument();
    });

    const detailsButtons = screen.getAllByText("Details");
    const yamlButtons = screen.getAllByText("YAML");

    expect(detailsButtons.length).toBeGreaterThan(0);
    expect(yamlButtons.length).toBeGreaterThan(0);
  });

  it("displays Unknown status when phase is not provided", async () => {
    const kubernetes = createMockKubernetes({
      list: vi.fn().mockResolvedValue({
        items: [
          {
            apiVersion: "logic.kubesmarts.org/v1",
            kind: "LogicFlowRuntime",
            metadata: { name: "no-status-runtime", namespace: "workflows" },
            spec: { persistenceMode: "Ephemeral" },
            status: {},
          },
        ],
      }),
    });
    const services = createMockServices(kubernetes);

    render(
      <QueryClientProvider client={queryClient}>
        <ConsoleProvider services={services}>
          <RuntimesPage />
        </ConsoleProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("no-status-runtime")).toBeInTheDocument();
    });

    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("0 / 0")).toBeInTheDocument();
  });
});
