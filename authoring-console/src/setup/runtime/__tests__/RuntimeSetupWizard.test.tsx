/**
 * Tests for RuntimeSetupWizard components.
 * Component-level tests for wizard steps (not full wizard rendering due to Monaco).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RuntimeSetupDraft } from "../types.ts";
import { ModeSelectionStep } from "../steps/ModeSelectionStep.tsx";
import { BasicConfigStep } from "../steps/BasicConfigStep.tsx";
import { ReplicasAndLoggingStep } from "../steps/ReplicasAndLoggingStep.tsx";

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
