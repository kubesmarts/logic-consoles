/**
 * Tests for TopologyView component.
 * Tests: graph/list switch, definition selection drawer, error states, partial topology.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GatewayTransport } from "../../../contracts/index.ts";
import { topologyFullFixture, topologyPartialFixture } from "../../../fixtures/topology.ts";
import { TopologyView } from "../TopologyView.tsx";

// Mock React Flow and Monaco
vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ nodes }: { nodes: any[] }) => (
    <div data-testid="react-flow">
      {nodes.map((n) => (
        <div key={n.id} data-node-id={n.id}>
          {n.data.label}
        </div>
      ))}
    </div>
  ),
  Background: () => null,
  Controls: () => null,
}));

const createMockGateway = (overrides?: Partial<GatewayTransport>): GatewayTransport => {
  const base: any = {
    getTopology: vi.fn().mockResolvedValue(topologyFullFixture),
    listDefinitions: vi.fn(),
    getDefinition: vi.fn(),
    listInstances: vi.fn(),
    getInstance: vi.fn(),
    execute: vi.fn(),
    executeSync: vi.fn(),
    suspendInstance: vi.fn(),
    resumeInstance: vi.fn(),
    cancelInstance: vi.fn(),
    ...(overrides as any),
  };

  return base as unknown as GatewayTransport;
};

const mockNavigation = {
  navigate: vi.fn(),
  currentPath: "/topology",
  params: {},
  location: { pathname: "/topology", search: "", hash: "", state: null },
};

describe("TopologyView", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it("renders loading state initially", () => {
    const gateway = createMockGateway({
      // @ts-expect-error Mock setup
      getTopology: vi.fn(() => new Promise(() => {})), // Never resolves
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TopologyView namespace="default" gateway={gateway} navigation={mockNavigation} />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText("Loading topology")).toBeInTheDocument();
  });

  it("renders graph view with nodes", async () => {
    const gateway = createMockGateway();

    render(
      <QueryClientProvider client={queryClient}>
        <TopologyView namespace="default" gateway={gateway} navigation={mockNavigation} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("react-flow")).toBeInTheDocument();
    });

    // Check that nodes are rendered
    expect(screen.getByText("Platform")).toBeInTheDocument();
    expect(screen.getByText("hello-runtime")).toBeInTheDocument();
  });

  it("renders list view when show list button is clicked", async () => {
    const gateway = createMockGateway();
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <TopologyView namespace="default" gateway={gateway} navigation={mockNavigation} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Show list")).toBeInTheDocument();
    });

    const toggleButton = screen.getByText("Show list");
    await user.click(toggleButton);

    // List view should show nodes in a table
    await waitFor(() => {
      expect(screen.getByText("Show graph")).toBeInTheDocument();
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    // Verify table contents
    const table = screen.getByRole("table");
    expect(within(table).getByText("Platform")).toBeInTheDocument();
    expect(within(table).getByText("hello-runtime")).toBeInTheDocument();
  });

  it("calls gateway.getTopology with correct namespace", async () => {
    const getTopology = vi.fn().mockResolvedValue(topologyFullFixture);
    const gateway = createMockGateway({ getTopology });

    render(
      <QueryClientProvider client={queryClient}>
        <TopologyView namespace="custom-ns" gateway={gateway} navigation={mockNavigation} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(getTopology).toHaveBeenCalledWith("custom-ns", expect.any(AbortSignal));
    });
  });

  it("renders partial topology warning", async () => {
    const gateway = createMockGateway({
      getTopology: vi.fn().mockResolvedValue(topologyPartialFixture),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TopologyView namespace="default" gateway={gateway} navigation={mockNavigation} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Partial topology")).toBeInTheDocument();
    });

    // Should still display warnings
    expect(screen.getByText(/RuntimeUnreadable/)).toBeInTheDocument();
  });

  it("handles 503 error state (index pending)", async () => {
    const gateway = createMockGateway({
      getTopology: vi.fn().mockRejectedValue({ kind: "index-pending" }),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TopologyView namespace="default" gateway={gateway} navigation={mockNavigation} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Topology discovery pending")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("handles unreachable gateway error state", async () => {
    const gateway = createMockGateway({
      getTopology: vi.fn().mockRejectedValue({ kind: "unreachable" }),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TopologyView namespace="default" gateway={gateway} navigation={mockNavigation} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Gateway unreachable")).toBeInTheDocument();
    });

    expect(screen.getByText("Kubernetes actions remain available")).toBeInTheDocument();
  });

  it("handles upstream error state (502)", async () => {
    const gateway = createMockGateway({
      getTopology: vi.fn().mockRejectedValue({ kind: "upstream-error" }),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TopologyView namespace="default" gateway={gateway} navigation={mockNavigation} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Gateway error")).toBeInTheDocument();
    });
  });

  it("handles denied access error state (403)", async () => {
    const gateway = createMockGateway({
      getTopology: vi.fn().mockRejectedValue({ kind: "denied" }),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TopologyView namespace="default" gateway={gateway} navigation={mockNavigation} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Access denied")).toBeInTheDocument();
    });

    // Should not show retry button for 403
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("retries on error when retry button clicked", async () => {
    const getTopology = vi.fn();
    getTopology.mockRejectedValueOnce({ kind: "unreachable" });
    getTopology.mockResolvedValueOnce(topologyFullFixture);

    const gateway = createMockGateway({ getTopology });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <TopologyView namespace="default" gateway={gateway} navigation={mockNavigation} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Gateway unreachable")).toBeInTheDocument();
    });

    const retryButton = screen.getByRole("button", { name: "Retry" });
    await user.click(retryButton);

    // Should now show graph
    await waitFor(() => {
      expect(screen.getByText("Show list")).toBeInTheDocument();
    });
  });

  it("displays definition drawer on node selection", async () => {
    const gateway = createMockGateway();
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <TopologyView namespace="default" gateway={gateway} navigation={mockNavigation} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Show list")).toBeInTheDocument();
    });

    // Switch to list view to click on a definition
    const toggleButton = screen.getByText("Show list");
    await user.click(toggleButton);

    // Click on a definition row (hello-world 1.0.0)
    const rows = screen.getAllByRole("row");
    const definitionRow = rows.find((r) => within(r).queryByText("hello-world 1.0.0"));

    if (definitionRow) {
      await user.click(definitionRow);

      // Drawer should open with definition details
      await waitFor(() => {
        expect(screen.getByText("Definition Details")).toBeInTheDocument();
      });

      expect(screen.getByText("View deployed version")).toBeInTheDocument();
    }
  });

  it("navigates to deployed version when drawer button clicked", async () => {
    const gateway = createMockGateway();
    const navigate = vi.fn();
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <TopologyView
          namespace="default"
          gateway={gateway}
          navigation={{ ...mockNavigation, navigate }}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Show list")).toBeInTheDocument();
    });

    // Switch to list view
    await user.click(screen.getByText("Show list"));

    // Click on a definition row
    const rows = screen.getAllByRole("row");
    const definitionRow = rows.find((r) => within(r).queryByText("hello-world 1.0.0"));

    if (definitionRow) {
      await user.click(definitionRow);

      // Click "View deployed version" button
      const viewButton = await screen.findByText("View deployed version");
      await user.click(viewButton);

      // Check navigation was called
      await waitFor(() => {
        expect(navigate).toHaveBeenCalledWith(
          expect.stringContaining("/workflows/default/hello-world/1.0.0")
        );
      });
    }
  });
});
