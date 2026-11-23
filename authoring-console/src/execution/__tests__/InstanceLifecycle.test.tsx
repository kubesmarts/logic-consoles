/**
 * Tests for InstanceLifecycle component.
 * Tests: suspend/resume/cancel actions, confirmation modal, stale-state handling.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GatewayTransport, DefinitionResource } from "../../contracts/index.ts";
import { InstanceLifecycle } from "../InstanceLifecycle.tsx";

const createMockGateway = (overrides?: Partial<GatewayTransport>): GatewayTransport => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base: any = {
    getTopology: vi.fn(),
    listDefinitions: vi.fn(),
    getDefinition: vi.fn(),
    listInstances: vi.fn(),
    getInstance: vi.fn(),
    execute: vi.fn(),
    executeSync: vi.fn(),
    suspendInstance: vi.fn().mockResolvedValue({ instanceId: "test-123", httpStatus: 200, raw: {} }),
    resumeInstance: vi.fn().mockResolvedValue({ instanceId: "test-123", httpStatus: 200, raw: {} }),
    cancelInstance: vi.fn().mockResolvedValue({ instanceId: "test-123", httpStatus: 200, raw: {} }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(overrides as any),
  };
  return base as unknown as GatewayTransport;
};

const createDefinition = (): DefinitionResource => ({
  namespace: "default",
  name: "test-workflow",
  version: "1.0.0",
  _links: {
    self: { href: "/v1/definitions/default/test-workflow/1.0.0", method: "GET", operationId: "getDefinition" },
    execute: { href: "/v1/runtime/default/test-workflow/1.0.0", method: "POST", operationId: "execute" },
    executeSync: { href: "/v1/runtime/default/test-workflow/1.0.0/sync", method: "POST", operationId: "executeSync" },
    instances: { href: "/v1/instances/?namespace=default&name=test-workflow&version=1.0.0", method: "GET", operationId: "listInstances" },
    instance: { href: "/v1/instances/{id}", method: "GET", operationId: "getInstance", templated: true },
    suspend: { href: "/v1/runtime/default/test-workflow/1.0.0/instance/{id}/suspend", method: "POST", operationId: "suspend", templated: true },
    resume: { href: "/v1/runtime/default/test-workflow/1.0.0/instance/{id}/resume", method: "POST", operationId: "resume", templated: true },
    cancel: { href: "/v1/runtime/default/test-workflow/1.0.0/instance/{id}/cancel", method: "POST", operationId: "cancel", templated: true },
  },
});

describe("InstanceLifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders suspend, resume, and cancel buttons when links are available", () => {
    const gateway = createMockGateway();
    const definition = createDefinition();

    render(<InstanceLifecycle definition={definition} instanceId="test-123" gateway={gateway} />);

    expect(screen.getByRole("button", { name: /Suspend/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resume/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel instance/i })).toBeInTheDocument();
  });

  it("calls suspendInstance when suspend button is clicked", async () => {
    const user = userEvent.setup();
    const gateway = createMockGateway();
    const definition = createDefinition();

    render(<InstanceLifecycle definition={definition} instanceId="test-123" gateway={gateway} />);

    const suspendButton = screen.getByRole("button", { name: /Suspend/i });
    await user.click(suspendButton);

    await waitFor(() => {
      expect(gateway.suspendInstance).toHaveBeenCalledWith(
        definition._links.suspend,
        "test-123",
        expect.any(AbortSignal)
      );
    });
  });

  it("calls resumeInstance when resume button is clicked", async () => {
    const user = userEvent.setup();
    const gateway = createMockGateway();
    const definition = createDefinition();

    render(<InstanceLifecycle definition={definition} instanceId="test-123" gateway={gateway} />);

    const resumeButton = screen.getByRole("button", { name: /Resume/i });
    await user.click(resumeButton);

    await waitFor(() => {
      expect(gateway.resumeInstance).toHaveBeenCalledWith(
        definition._links.resume,
        "test-123",
        expect.any(AbortSignal)
      );
    });
  });

  it("shows confirmation modal before canceling", async () => {
    const user = userEvent.setup();
    const gateway = createMockGateway();
    const definition = createDefinition();

    render(<InstanceLifecycle definition={definition} instanceId="test-123" gateway={gateway} />);

    const cancelButton = screen.getByRole("button", { name: /Cancel instance/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.getByText(/Confirm cancellation/i)).toBeInTheDocument();
      expect(screen.getByText(/test-123/i)).toBeInTheDocument();
    });

    // Should NOT have called cancelInstance yet
    expect(gateway.cancelInstance).not.toHaveBeenCalled();
  });

  it("calls cancelInstance when confirmed", async () => {
    const user = userEvent.setup();
    const gateway = createMockGateway();
    const definition = createDefinition();

    render(<InstanceLifecycle definition={definition} instanceId="test-123" gateway={gateway} />);

    const cancelButton = screen.getByRole("button", { name: /Cancel instance/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.getByText(/Confirm cancellation/i)).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole("button", { name: /Cancel instance/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(gateway.cancelInstance).toHaveBeenCalledWith(
        definition._links.cancel,
        "test-123",
        expect.any(AbortSignal)
      );
    });
  });

  it("displays success message after successful action", async () => {
    const user = userEvent.setup();
    const gateway = createMockGateway();
    const definition = createDefinition();

    render(<InstanceLifecycle definition={definition} instanceId="test-123" gateway={gateway} />);

    const suspendButton = screen.getByRole("button", { name: /Suspend/i });
    await user.click(suspendButton);

    await waitFor(() => {
      expect(screen.getByText(/Action completed successfully/i)).toBeInTheDocument();
    });
  });

  it("handles stale-state rejection (409)", async () => {
    const user = userEvent.setup();
    const gateway = createMockGateway({
      suspendInstance: vi.fn().mockResolvedValue({ instanceId: "test-123", httpStatus: 409, raw: {} }),
    });
    const definition = createDefinition();

    render(<InstanceLifecycle definition={definition} instanceId="test-123" gateway={gateway} />);

    const suspendButton = screen.getByRole("button", { name: /Suspend/i });
    await user.click(suspendButton);

    await waitFor(() => {
      expect(screen.getByText(/instance state has changed/i)).toBeInTheDocument();
    });
  });

  it("displays error message when action fails", async () => {
    const user = userEvent.setup();
    const gateway = createMockGateway({
      suspendInstance: vi.fn().mockRejectedValue(new Error("Network error")),
    });
    const definition = createDefinition();

    render(<InstanceLifecycle definition={definition} instanceId="test-123" gateway={gateway} />);

    const suspendButton = screen.getByRole("button", { name: /Suspend/i });
    await user.click(suspendButton);

    await waitFor(() => {
      expect(screen.getByText(/outcome is unknown/i)).toBeInTheDocument();
    });
  });

  it("calls onActionComplete callback after successful action", async () => {
    const user = userEvent.setup();
    const onActionComplete = vi.fn();
    const gateway = createMockGateway();
    const definition = createDefinition();

    render(
      <InstanceLifecycle
        definition={definition}
        instanceId="test-123"
        gateway={gateway}
        onActionComplete={onActionComplete}
      />
    );

    const suspendButton = screen.getByRole("button", { name: /Suspend/i });
    await user.click(suspendButton);

    await waitFor(() => {
      expect(onActionComplete).toHaveBeenCalled();
    });
  });

  it("hides buttons when lifecycle links are missing", () => {
    const gateway = createMockGateway();
    const definition = {
      ...createDefinition(),
      _links: {
        ...createDefinition()._links,
        suspend: undefined as never,
        resume: undefined as never,
        cancel: undefined as never,
      },
    };

    render(<InstanceLifecycle definition={definition} instanceId="test-123" gateway={gateway} />);

    // All buttons should be hidden when their corresponding links are missing
    expect(screen.queryByRole("button", { name: /Suspend/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Resume/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancel instance/i })).not.toBeInTheDocument();
  });

  it("hides only specific buttons when some links are missing", () => {
    const gateway = createMockGateway();
    const definition = {
      ...createDefinition(),
      _links: {
        ...createDefinition()._links,
        suspend: undefined as never, // Missing suspend
        // resume and cancel are present
      },
    };

    render(<InstanceLifecycle definition={definition} instanceId="test-123" gateway={gateway} />);

    // Suspend button should be hidden
    expect(screen.queryByRole("button", { name: /Suspend/i })).not.toBeInTheDocument();

    // Resume and Cancel should be visible
    expect(screen.getByRole("button", { name: /Resume/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel instance/i })).toBeInTheDocument();
  });

  it("shows loading state on button during action", async () => {
    const user = userEvent.setup();
    // Create a promise we can control to keep the action pending
    let resolveSuspend!: (value: { instanceId: string; httpStatus: number; raw: unknown }) => void;
    const suspendPromise = new Promise<{ instanceId: string; httpStatus: number; raw: unknown }>(
      (resolve) => {
        resolveSuspend = resolve;
      }
    );

    const gateway = createMockGateway({
      suspendInstance: vi.fn().mockReturnValue(suspendPromise),
    });
    const definition = createDefinition();

    render(<InstanceLifecycle definition={definition} instanceId="test-123" gateway={gateway} />);

    const suspendButton = screen.getByRole("button", { name: /Suspend/i });

    // Before clicking, button should not be disabled
    expect(suspendButton).not.toBeDisabled();

    await user.click(suspendButton);

    // During the action, button should be disabled and show loading indicator
    await waitFor(() => {
      expect(suspendButton).toBeDisabled();
      // PatternFly Button with isLoading adds pf-m-in-progress class and shows a spinner
      expect(suspendButton).toHaveClass("pf-m-in-progress");
    });

    // Resolve the action
    resolveSuspend({ instanceId: "test-123", httpStatus: 200, raw: {} });

    // After completion, button should return to normal state
    await waitFor(() => {
      expect(suspendButton).not.toBeDisabled();
      expect(suspendButton).not.toHaveClass("pf-m-in-progress");
    });
  });
});
