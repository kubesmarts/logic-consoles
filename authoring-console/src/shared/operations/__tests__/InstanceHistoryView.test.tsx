/**
 * Tests for InstanceHistoryView component.
 * Tests: instance listing, error states (empty, 503, 502, 403), instance detail drawer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GatewayTransport, WorkflowVersionKey } from "../../../contracts/index.ts";
import { instanceFixtures } from "../../../fixtures/instances.ts";
import { InstanceHistoryView } from "../InstanceHistoryView.tsx";

// Mock theme
vi.mock("../../app/theme.tsx", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

const createMockGateway = (overrides?: Partial<GatewayTransport>): GatewayTransport => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base: any = {
    getTopology: vi.fn(),
    listDefinitions: vi.fn(),
    getDefinition: vi.fn(),
    listInstances: vi.fn().mockResolvedValue(instanceFixtures),
    getInstance: vi.fn().mockResolvedValue(instanceFixtures[0]),
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

const versionKey: WorkflowVersionKey = {
  namespace: "default",
  workflowName: "hello-world",
  version: "1.0.0",
};

describe("InstanceHistoryView", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it("renders loading state initially", () => {
    const gateway = createMockGateway({
      // @ts-expect-error Mock setup
      listInstances: vi.fn(() => new Promise(() => {})), // Never resolves
    });

    render(
      <QueryClientProvider client={queryClient}>
        <InstanceHistoryView versionKey={versionKey} gateway={gateway} />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText("Loading instance history")).toBeInTheDocument();
  });

  it("renders empty state when no instances exist", async () => {
    const gateway = createMockGateway({
      listInstances: vi.fn().mockResolvedValue([]),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <InstanceHistoryView versionKey={versionKey} gateway={gateway} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("No instances")).toBeInTheDocument();
    });

    expect(screen.getByText("No executions have been indexed for this version.")).toBeInTheDocument();
  });

  it("renders instances table with correct columns", async () => {
    const gateway = createMockGateway();

    render(
      <QueryClientProvider client={queryClient}>
        <InstanceHistoryView versionKey={versionKey} gateway={gateway} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Instance history")).toBeInTheDocument();
    });

    const table = screen.getByLabelText("Instance history");
    expect(within(table).getByText("ID")).toBeInTheDocument();
    expect(within(table).getByText("Status")).toBeInTheDocument();
    expect(within(table).getByText("Started")).toBeInTheDocument();
    expect(within(table).getByText("Ended")).toBeInTheDocument();
  });

  it("renders instances in the table", async () => {
    const gateway = createMockGateway();

    render(
      <QueryClientProvider client={queryClient}>
        <InstanceHistoryView versionKey={versionKey} gateway={gateway} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Instance history")).toBeInTheDocument();
    });

    // Check for specific instance data
    expect(screen.getByText(/1f8c0b3a-0001/)).toBeInTheDocument();
    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
  });

  it("calls listInstances with correct filter parameters", async () => {
    const listInstances = vi.fn().mockResolvedValue(instanceFixtures);
    const gateway = createMockGateway({ listInstances });

    render(
      <QueryClientProvider client={queryClient}>
        <InstanceHistoryView versionKey={versionKey} gateway={gateway} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(listInstances).toHaveBeenCalledWith(
        {
          namespace: "default",
          name: "hello-world",
          version: "1.0.0",
        },
        expect.any(AbortSignal)
      );
    });
  });

  it("displays instance count in toolbar", async () => {
    const gateway = createMockGateway();

    render(
      <QueryClientProvider client={queryClient}>
        <InstanceHistoryView versionKey={versionKey} gateway={gateway} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("2 instances")).toBeInTheDocument();
    });
  });

  it("handles 503 error state (index pending)", async () => {
    const gateway = createMockGateway({
      listInstances: vi.fn().mockRejectedValue({ kind: "index-pending" }),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <InstanceHistoryView versionKey={versionKey} gateway={gateway} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Index pending")).toBeInTheDocument();
    });

    expect(screen.getByText(/Data Index is still being populated/)).toBeInTheDocument();
  });

  it("handles unreachable gateway error", async () => {
    const gateway = createMockGateway({
      listInstances: vi.fn().mockRejectedValue({ kind: "unreachable" }),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <InstanceHistoryView versionKey={versionKey} gateway={gateway} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Gateway unreachable")).toBeInTheDocument();
    });
  });

  it("handles 502 upstream error (index unavailable)", async () => {
    const gateway = createMockGateway({
      listInstances: vi.fn().mockRejectedValue({ kind: "upstream-error" }),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <InstanceHistoryView versionKey={versionKey} gateway={gateway} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Index unavailable")).toBeInTheDocument();
    });

    expect(screen.getByText(/Data Index is temporarily unavailable/)).toBeInTheDocument();
  });

  it("handles 403 denied access error", async () => {
    const gateway = createMockGateway({
      listInstances: vi.fn().mockRejectedValue({ kind: "denied" }),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <InstanceHistoryView versionKey={versionKey} gateway={gateway} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Access denied")).toBeInTheDocument();
    });

    // Should not show retry button for 403
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("retries on error when retry button clicked", async () => {
    const listInstances = vi.fn();
    listInstances.mockRejectedValueOnce({ kind: "upstream-error" });
    listInstances.mockResolvedValueOnce(instanceFixtures);

    const gateway = createMockGateway({ listInstances });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <InstanceHistoryView versionKey={versionKey} gateway={gateway} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Index unavailable")).toBeInTheDocument();
    });

    const retryButton = screen.getByRole("button", { name: "Retry" });
    await user.click(retryButton);

    // Should now show instances
    await waitFor(() => {
      expect(screen.getByLabelText("Instance history")).toBeInTheDocument();
    });
  });

  it("opens instance detail drawer when Details button clicked", async () => {
    const gateway = createMockGateway();
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <InstanceHistoryView versionKey={versionKey} gateway={gateway} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Instance history")).toBeInTheDocument();
    });

    // Click Details button
    const detailsButtons = screen.getAllByText("Details");
    await user.click(detailsButtons[0] as HTMLElement);

    // Drawer should open
    await waitFor(() => {
      expect(screen.getByText(/Instance .../)).toBeInTheDocument();
    });
  });

  it("loads and displays instance detail in drawer", async () => {
    const getInstance = vi.fn().mockResolvedValue(instanceFixtures[0]);
    const gateway = createMockGateway({ getInstance });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <InstanceHistoryView versionKey={versionKey} gateway={gateway} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Instance history")).toBeInTheDocument();
    });

    // Click Details button
    const detailsButtons = screen.getAllByText("Details");
    await user.click(detailsButtons[0] as HTMLElement);

    // Check that instance data is displayed in the drawer
    const completedElements = await screen.findAllByText("COMPLETED");
    expect(completedElements.length).toBeGreaterThan(0);
    expect(await screen.findByText("default")).toBeInTheDocument();
    expect(await screen.findByText("hello-world")).toBeInTheDocument();
    expect(await screen.findByText("1.0.0")).toBeInTheDocument();
  });

  it("closes drawer when close button clicked", async () => {
    const gateway = createMockGateway();
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <InstanceHistoryView versionKey={versionKey} gateway={gateway} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Instance history")).toBeInTheDocument();
    });

    // Click Details button
    const detailsButtons = screen.getAllByText("Details");
    await user.click(detailsButtons[0] as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText(/Instance .../)).toBeInTheDocument();
    });

    // Click close button (the X button in the drawer)
    const closeButtons = screen.getAllByRole("button").filter((btn) => btn.className.includes("close"));
    if (closeButtons.length > 0) {
      await user.click(closeButtons[0] as HTMLElement);

      // Drawer should close
      await waitFor(() => {
        expect(screen.queryByText(/Instance .../)).not.toBeInTheDocument();
      });
    }
  });

  it("handles error loading instance detail", async () => {
    const getInstance = vi.fn().mockRejectedValue({ kind: "unreachable" });
    const gateway = createMockGateway({ getInstance });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <InstanceHistoryView versionKey={versionKey} gateway={gateway} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Instance history")).toBeInTheDocument();
    });

    // Click Details button
    const detailsButtons = screen.getAllByText("Details");
    await user.click(detailsButtons[0] as HTMLElement);

    // Should show error state
    await waitFor(() => {
      expect(screen.getByText("Instance details unavailable")).toBeInTheDocument();
    });
  });
});
