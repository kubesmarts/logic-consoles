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

// Mock theme
vi.mock("../../app/theme.tsx", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

// Mock TopologyCanvas to avoid nested useTheme calls
// The mock must accept and call onNodeSelect callback to test graph selection
vi.mock("../../../editors/TopologyCanvas.tsx", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TopologyCanvas: ({ graph, onNodeSelect }: { graph: any; onNodeSelect?: any }) => (
    <div data-testid="topology-canvas">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {graph?.nodes?.map((n: any) => (
        <button
          key={n.id}
          data-node-id={n.id}
          data-testid={`node-button-${n.id}`}
          onClick={() => onNodeSelect?.(n.id)}
        >
          {n.label}
        </button>
      ))}
    </div>
  ),
}));

// Mock React Flow and Monaco
vi.mock("@xyflow/react", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      expect(screen.getByTestId("topology-canvas")).toBeInTheDocument();
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
      expect(screen.getByTestId("topology-canvas")).toBeInTheDocument();
    });

    const toggleButton = screen.getByText("Show list");
    await user.click(toggleButton);

    // List view should show nodes in a table
    await waitFor(() => {
      expect(screen.getByText("Show graph")).toBeInTheDocument();
      expect(screen.getByLabelText("Topology nodes")).toBeInTheDocument();
    });

    // Verify table contents
    const table = screen.getByLabelText("Topology nodes");
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

    // Check that error message appears
    expect(await screen.findByText("Gateway unreachable")).toBeInTheDocument();
    expect(screen.getByText(/Kubernetes actions remain available/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
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

    // Click on a definition row (hello-world)
    const rows = screen.getAllByRole("row");
    const definitionRow = rows.find((r) => within(r).queryByText("hello-world"));

    expect(definitionRow).toBeTruthy();
    await user.click(definitionRow!);

    // Drawer should open with definition details
    await waitFor(() => {
      expect(screen.getByText("Definition Details")).toBeInTheDocument();
    });

    expect(screen.getByText("View deployed version")).toBeInTheDocument();
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
    const definitionRow = rows.find((r) => within(r).queryByText("hello-world"));

    expect(definitionRow).toBeTruthy();
    await user.click(definitionRow!);

    // Click "View deployed version" button
    const viewButton = await screen.findByText("View deployed version");
    await user.click(viewButton);

    // Check navigation was called with workflow name (from node.label), not CR name
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        expect.stringContaining("/workflows/default/hello-world/1.0.0")
      );
    });
  });

  it("renders runAction slot when provided in definition drawer", async () => {
    const gateway = createMockGateway();
    const renderRunAction = vi.fn(() => <div data-testid="run-action-slot">Run Workflow</div>);
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <TopologyView
          namespace="default"
          gateway={gateway}
          navigation={mockNavigation}
          renderRunAction={renderRunAction}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("topology-canvas")).toBeInTheDocument();
    });

    // Switch to list view
    await user.click(screen.getByText("Show list"));

    // Click on a definition row
    const rows = screen.getAllByRole("row");
    const definitionRow = rows.find((r) => within(r).queryByText("hello-world"));

    expect(definitionRow).toBeTruthy();
    await user.click(definitionRow!);

    // Check that runAction slot is rendered
    await waitFor(() => {
      expect(screen.getByTestId("run-action-slot")).toBeInTheDocument();
    });

    // Check that renderRunAction was called with the definition node
    expect(renderRunAction).toHaveBeenCalled();
  });

  it("opens definition drawer when graph node is clicked", async () => {
    const gateway = createMockGateway();
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <TopologyView namespace="default" gateway={gateway} navigation={mockNavigation} />
      </QueryClientProvider>,
    );

    // Wait for topology graph to load and display
    await waitFor(() => {
      expect(screen.getByTestId("topology-canvas")).toBeInTheDocument();
    });

    // Click on a definition node in the graph (hello-world 1.0.0)
    // The mock TopologyCanvas calls onNodeSelect with the node id on button click
    const definitionNodeButton = screen.getByTestId("node-button-definition/default/hello-world/1.0.0");
    await user.click(definitionNodeButton);

    // Drawer should open with definition details
    await waitFor(() => {
      expect(screen.getByText("Definition Details")).toBeInTheDocument();
    });

    // Verify the drawer shows version link
    expect(screen.getByText("View deployed version")).toBeInTheDocument();
  });

  it("navigates using workflow name (node.label), not CR name (node.name)", async () => {
    const navigate = vi.fn();
    const gateway = createMockGateway();
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
      expect(screen.getByTestId("topology-canvas")).toBeInTheDocument();
    });

    // Click on a definition node in the graph
    // Fixture: node.name="hello-world-v-1-0-0" (CR name), node.label="hello-world" (workflow name)
    const definitionNodeButton = screen.getByTestId("node-button-definition/default/hello-world/1.0.0");
    expect(definitionNodeButton).toBeTruthy();
    await user.click(definitionNodeButton);

    // Drawer should open
    await waitFor(() => {
      expect(screen.getByText("Definition Details")).toBeInTheDocument();
    });

    // Click "View deployed version" button
    const viewButton = screen.getByText("View deployed version");
    await user.click(viewButton);

    // Should navigate using workflow name ("hello-world" from node.label), NOT CR name ("hello-world-v-1-0-0" from node.name)
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        "/workflows/default/hello-world/1.0.0"
      );
    });
  });

  it("maintains selection when drawer opens and closes", async () => {
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

    // Switch to list view
    await user.click(screen.getByText("Show list"));

    // Click on a definition row
    const rows = screen.getAllByRole("row");
    const definitionRow = rows.find((r) => within(r).queryByText("hello-world"));

    expect(definitionRow).toBeTruthy();
    await user.click(definitionRow!);

    // Drawer should open with definition details
    await waitFor(() => {
      expect(screen.getByText("Definition Details")).toBeInTheDocument();
    });

    // Verify the drawer content is visible (confirms selection is active)
    expect(screen.getByText("View deployed version")).toBeInTheDocument();

    // Test selection persistence: switch back to graph view
    const showGraphButton = screen.getByText("Show graph");
    await user.click(showGraphButton);

    // Drawer should still be visible (selection persists across view switch)
    await waitFor(() => {
      expect(screen.getByText("Definition Details")).toBeInTheDocument();
    });

    // Switch back to list view and verify drawer is still showing
    const showListButton = screen.getByText("Show list");
    await user.click(showListButton);

    await waitFor(() => {
      expect(screen.getByText("Definition Details")).toBeInTheDocument();
    });
  });
});
