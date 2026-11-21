/**
 * Tests for RunPanel component.
 * Tests: schema-driven form generation, form vs JSON equivalence, sync/async execution,
 * exactly-one-POST guarantee, timeout handling, missing link handling.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GatewayTransport, DefinitionResource, WorkflowDocument } from "../../contracts/index.ts";
import { RunPanel } from "../RunPanel.tsx";

// Mock Monaco editor
vi.mock("../../editors/YamlEditor.tsx", () => ({
  YamlEditor: () => null,
}));

// Mock React Flow
vi.mock("@xyflow/react", () => ({
  ReactFlow: () => null,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
}));

const createMockGateway = (overrides?: Partial<GatewayTransport>): GatewayTransport => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base: any = {
    getTopology: vi.fn(),
    listDefinitions: vi.fn(),
    getDefinition: vi.fn(),
    listInstances: vi.fn(),
    getInstance: vi.fn(),
    execute: vi.fn().mockResolvedValue({ instanceId: "test-instance-123", raw: {} }),
    executeSync: vi.fn().mockResolvedValue({ output: { result: "success" }, raw: {} }),
    suspendInstance: vi.fn(),
    resumeInstance: vi.fn(),
    cancelInstance: vi.fn(),
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

describe("RunPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Schema-driven form generation", () => {
    it("renders form fields for supported schema", async () => {
      const flow: WorkflowDocument = {
        document: { name: "test-workflow", version: "1.0.0", dsl: "1.0.0", namespace: "default" },
        input: {
          schema: {
            document: {
              type: "object",
              properties: {
                username: { type: "string" },
                age: { type: "integer" },
                active: { type: "boolean" },
              },
              required: ["username"],
            },
          },
        },
        do: [],
      } as unknown as WorkflowDocument;

      const gateway = createMockGateway();
      const definition = createDefinition();

      render(<RunPanel definition={definition} flow={flow} gateway={gateway} isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByLabelText("Username")).toBeInTheDocument();
        expect(screen.getByLabelText("Age")).toBeInTheDocument();
        expect(screen.getByLabelText("Active")).toBeInTheDocument();
      });
    });

    it("renders JSON input for workflow without schema", async () => {
      const flow: WorkflowDocument = {
        document: { name: "test-workflow", version: "1.0.0", dsl: "1.0.0", namespace: "default" },
        do: [],
      };

      const gateway = createMockGateway();
      const definition = createDefinition();

      render(<RunPanel definition={definition} flow={flow} gateway={gateway} isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText(/Raw JSON input/i)).toBeInTheDocument();
        expect(screen.getByLabelText("JSON input")).toBeInTheDocument();
      });
    });

    it("allows switching between form and JSON modes when schema is supported", async () => {
      const user = userEvent.setup();
      const flow: WorkflowDocument = {
        document: { name: "test-workflow", version: "1.0.0", dsl: "1.0.0", namespace: "default" },
        input: {
          schema: {
            document: {
              type: "object",
              properties: { name: { type: "string" } },
            },
          },
        },
        do: [],
      } as unknown as WorkflowDocument;

      const gateway = createMockGateway();
      const definition = createDefinition();

      render(<RunPanel definition={definition} flow={flow} gateway={gateway} isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByLabelText("Name")).toBeInTheDocument();
      });

      // Switch to JSON mode
      const jsonModeRadio = screen.getByLabelText("Raw JSON");
      await user.click(jsonModeRadio);

      await waitFor(() => {
        expect(screen.getByLabelText("JSON input")).toBeInTheDocument();
      });
    });
  });

  describe("Execution modes", () => {
    it("defaults to sync execution mode", async () => {
      const flow: WorkflowDocument = {
        document: { name: "test-workflow", version: "1.0.0", dsl: "1.0.0", namespace: "default" },
        do: [],
      };

      const gateway = createMockGateway();
      const definition = createDefinition();

      render(<RunPanel definition={definition} flow={flow} gateway={gateway} isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        const syncRadio = screen.getByLabelText(/Run and wait/i);
        expect(syncRadio).toBeChecked();
      });
    });

    it("displays sync output after successful sync execution", async () => {
      const user = userEvent.setup();
      const flow: WorkflowDocument = {
        document: { name: "test-workflow", version: "1.0.0", dsl: "1.0.0", namespace: "default" },
        do: [],
      };

      const mockOutput = { message: "Hello, world!", status: "completed" };
      const gateway = createMockGateway({
        executeSync: vi.fn().mockResolvedValue({ output: mockOutput, raw: {} }),
      });
      const definition = createDefinition();

      render(<RunPanel definition={definition} flow={flow} gateway={gateway} isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Run and wait/i })).toBeInTheDocument();
      });

      const runButton = screen.getByRole("button", { name: /Run and wait/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByText(/Workflow output/i)).toBeInTheDocument();
        expect(screen.getByText(/Hello, world!/i)).toBeInTheDocument();
      });

      // Verify exactly ONE call to executeSync
      expect(gateway.executeSync).toHaveBeenCalledTimes(1);
    });

    it("displays instance ID after successful async execution", async () => {
      const user = userEvent.setup();
      const flow: WorkflowDocument = {
        document: { name: "test-workflow", version: "1.0.0", dsl: "1.0.0", namespace: "default" },
        do: [],
      };

      const gateway = createMockGateway({
        execute: vi.fn().mockResolvedValue({ instanceId: "async-instance-456", raw: {} }),
      });
      const definition = createDefinition();

      render(<RunPanel definition={definition} flow={flow} gateway={gateway} isOpen={true} onClose={vi.fn()} />);

      // Switch to async mode
      await waitFor(() => {
        const asyncRadio = screen.getByLabelText(/Start in background/i);
        expect(asyncRadio).toBeInTheDocument();
      });

      const asyncRadio = screen.getByLabelText(/Start in background/i);
      await user.click(asyncRadio);

      const runButton = screen.getByRole("button", { name: /Start in background/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByText(/Instance started/i)).toBeInTheDocument();
        expect(screen.getByText(/async-instance-456/i)).toBeInTheDocument();
      });

      // Verify exactly ONE call to execute
      expect(gateway.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe("Form vs JSON equivalence", () => {
    it("sends the same body from form mode with schema", async () => {
      const user = userEvent.setup();
      const flow: WorkflowDocument = {
        document: { name: "test-workflow", version: "1.0.0", dsl: "1.0.0", namespace: "default" },
        input: {
          schema: {
            document: {
              type: "object",
              properties: { name: { type: "string" } },
            },
          },
        },
        do: [],
      } as unknown as WorkflowDocument;

      const executeSync = vi.fn().mockResolvedValue({ output: {}, raw: {} });
      const gateway = createMockGateway({ executeSync });
      const definition = createDefinition();

      render(
        <RunPanel definition={definition} flow={flow} gateway={gateway} isOpen={true} onClose={vi.fn()} />
      );

      await waitFor(() => {
        expect(screen.getByLabelText("Name")).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText("Name");
      await user.clear(nameInput);
      await user.type(nameInput, "Alice");

      const runButton = screen.getByRole("button", { name: /Run and wait/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(executeSync).toHaveBeenCalledWith(
          definition._links.executeSync,
          { name: "Alice" },
          expect.any(AbortSignal)
        );
      });
    });

    it("sends the same body from JSON mode", async () => {
      const user = userEvent.setup();
      const flow: WorkflowDocument = {
        document: { name: "test-workflow", version: "1.0.0", dsl: "1.0.0", namespace: "default" },
        input: {
          schema: {
            document: {
              type: "object",
              properties: { name: { type: "string" } },
            },
          },
        },
        do: [],
      } as unknown as WorkflowDocument;

      const executeSync = vi.fn().mockResolvedValue({ output: {}, raw: {} });
      const gateway = createMockGateway({ executeSync });
      const definition = createDefinition();

      render(<RunPanel definition={definition} flow={flow} gateway={gateway} isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        const jsonRadio = screen.getByLabelText("Raw JSON");
        expect(jsonRadio).toBeInTheDocument();
      });

      const jsonRadio = screen.getByLabelText("Raw JSON");
      await user.click(jsonRadio);

      await waitFor(() => {
        expect(screen.getByLabelText("JSON input")).toBeInTheDocument();
      });

      const jsonInput = screen.getByLabelText("JSON input") as HTMLTextAreaElement;
      await user.clear(jsonInput);
      // Use paste instead of type to avoid special character interpretation
      await user.paste('{"name": "Alice"}');

      const runButton = screen.getByRole("button", { name: /Run and wait/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(executeSync).toHaveBeenCalledWith(
          definition._links.executeSync,
          { name: "Alice" },
          expect.any(AbortSignal)
        );
      });
    });
  });

  describe("Error handling", () => {
    it("makes exactly one POST even on timeout", async () => {
      const user = userEvent.setup();
      const flow: WorkflowDocument = {
        document: { name: "test-workflow", version: "1.0.0", dsl: "1.0.0", namespace: "default" },
        do: [],
      };

      const executeSync = vi.fn().mockRejectedValue(new Error("Request timeout"));
      const gateway = createMockGateway({ executeSync });
      const definition = createDefinition();

      render(<RunPanel definition={definition} flow={flow} gateway={gateway} isOpen={true} onClose={vi.fn()} />);

      const runButton = screen.getByRole("button", { name: /Run and wait/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByText(/timed out/i)).toBeInTheDocument();
      });

      // Verify exactly ONE call despite timeout
      expect(executeSync).toHaveBeenCalledTimes(1);
    });

    it("displays error when execution link is missing", async () => {
      const user = userEvent.setup();
      const flow: WorkflowDocument = {
        document: { name: "test-workflow", version: "1.0.0", dsl: "1.0.0", namespace: "default" },
        do: [],
      };

      const gateway = createMockGateway();
      const definition = {
        ...createDefinition(),
        _links: {
          ...createDefinition()._links,
          executeSync: undefined as never,
        },
      };

      render(<RunPanel definition={definition} flow={flow} gateway={gateway} isOpen={true} onClose={vi.fn()} />);

      const runButton = screen.getByRole("button", { name: /Run and wait/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
      });

      // Should not call executeSync when link is missing
      expect(gateway.executeSync).not.toHaveBeenCalled();
    });
  });
});
