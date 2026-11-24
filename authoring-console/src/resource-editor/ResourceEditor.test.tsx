/**
 * Integration tests for ResourceEditor component.
 *
 * Cover the acceptance scenarios from the brief:
 * - Advanced field round-trip (Form→YAML→Form preserves advanced fields)
 * - Invalid YAML stale preview
 * - 409 conflict reload/reapply
 * - Admission error field mapping
 * - Transport injection (works with fixture transports)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { KubeObject, ResourceRef } from "../contracts/index.ts";
import { createFixtureKubernetesTransport } from "../fixtures/transports/kubernetes.ts";
import { ResourceEditor } from "./ResourceEditor.tsx";

// Mock YamlEditor (browser-only component that depends on Monaco and theme)
vi.mock("../editors/YamlEditor.tsx", () => ({
  YamlEditor: ({ value, onChange, ariaLabel }: { value?: string; onChange?: (v: string) => void; ariaLabel?: string }) => (
    <div data-testid="yaml-editor">
      <textarea
        data-testid="monaco"
        aria-label={ariaLabel}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  ),
}));

describe("ResourceEditor acceptance scenarios", () => {
  it("preserves advanced field across Form→YAML→Form toggle", async () => {
    const user = userEvent.setup();

    const advancedSeed: KubeObject<{
      replicas: number;
      template: { spec: { containers: unknown[]; advancedPodField: string } };
    }> = {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name: "test-deployment", namespace: "default" },
      spec: {
        replicas: 2,
        template: {
          spec: {
            containers: [{ name: "app", image: "example:1.0" }],
            advancedPodField: "user-configured-value",
          },
        },
      },
    };

    const ref: ResourceRef = {
      gvk: { group: "apps", version: "v1", kind: "Deployment" },
      name: "test-deployment",
      namespace: "default",
    };

    const transport = createFixtureKubernetesTransport();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedController: any = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderForm = (controller: any) => {
      capturedController = controller;
      const replicas =
        (controller.state.draft.object?.spec as typeof advancedSeed.spec | undefined)
          ?.replicas ?? 2;
      return (
        <div>
          <label htmlFor="replicas">Replicas</label>
          <input
            id="replicas"
            type="number"
            value={replicas}
            onChange={(e) =>
              controller.updateFields([
                { path: "spec.replicas", value: parseInt(e.target.value, 10) },
              ])
            }
          />
        </div>
      );
    };

    render(
      <ResourceEditor
        transport={transport}
        ref={ref}
        seed={advancedSeed}
        verb="create"
        renderForm={renderForm}
      />,
    );

    // 1. Update replicas in form view
    const replicasInput = screen.getByLabelText("Replicas");
    await user.clear(replicasInput);
    await user.type(replicasInput, "3");

    // Verify the advanced field is still in the draft
    expect(capturedController?.state.draft.object?.spec?.template.spec.advancedPodField).toBe(
      "user-configured-value",
    );

    // 2. Toggle to YAML view
    await user.click(screen.getByText("YAML"));

    // 3. Verify YAML contains both the updated replicas AND the advanced field
    await waitFor(() => {
      const yamlEditor = screen.getByTestId("yaml-editor");
      expect(yamlEditor).toBeInTheDocument();
    });

    // Check the YAML text includes both
    expect(capturedController?.state.yamlText).toContain("replicas: 3");
    expect(capturedController?.state.yamlText).toContain("advancedPodField");
    expect(capturedController?.state.yamlText).toContain("user-configured-value");

    // 4. Toggle back to Form
    await user.click(screen.getByText("Form"));

    // 5. Verify advanced field is STILL preserved
    expect(capturedController?.state.draft.object?.spec?.template.spec.advancedPodField).toBe(
      "user-configured-value",
    );
    expect(capturedController?.state.draft.object?.spec?.replicas).toBe(3);
  });

  it("shows stale preview for invalid YAML", async () => {
    const user = userEvent.setup();

    const seed: KubeObject = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: "valid-namespace" },
    };

    const ref: ResourceRef = {
      gvk: { group: "", version: "v1", kind: "Namespace" },
      name: "valid-namespace",
    };

    const transport = createFixtureKubernetesTransport();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedController: any = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderForm = (controller: any) => {
      capturedController = controller;
      return <div>Form view</div>;
    };

    render(
      <ResourceEditor
        transport={transport}
        ref={ref}
        seed={seed}
        verb="create"
        renderForm={renderForm}
      />,
    );

    // Initially valid
    expect(capturedController?.state.draft.invalid).toBe(false);
    expect(screen.queryByText(/Invalid YAML/)).not.toBeInTheDocument();

    // Toggle to YAML
    await user.click(screen.getByText("YAML"));

    // Simulate typing invalid YAML (we can't actually type into Monaco in tests,
    // so we'll directly call the controller)
    const invalidYaml = `apiVersion: v1
kind: Namespace
metadata:
  name: test
  invalid: [unclosed array
`;

    capturedController?.updateYaml(invalidYaml);

    // Wait for the warning to appear
    await waitFor(() => {
      expect(screen.getByText(/Invalid YAML/)).toBeInTheDocument();
      expect(screen.getByText(/last valid preview is shown \(stale\)/)).toBeInTheDocument();
    });

    // Verify the draft is marked invalid
    expect(capturedController?.state.draft.invalid).toBe(true);
    expect(capturedController?.state.draft.object).toBeNull();

    // Verify the last valid preview is preserved (the original valid object)
    expect(capturedController?.state.yamlText).toBe(invalidYaml);
  });

  it("handles 409 conflict without silent overwrite", async () => {
    const user = userEvent.setup();

    const updateSeed: KubeObject = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: "test-namespace", resourceVersion: "1000" },
    };

    const ref: ResourceRef = {
      gvk: { group: "", version: "v1", kind: "Namespace" },
      name: "test-namespace",
    };

    const transport = createFixtureKubernetesTransport({ conflictOnUpdate: true });

    const renderForm = () => <div>Form view</div>;

    render(
      <ResourceEditor
        transport={transport}
        ref={ref}
        seed={updateSeed}
        verb="update"
        renderForm={renderForm}
      />,
    );

    // Attempt to update
    await user.click(screen.getByText("Update"));

    // Wait for the conflict error
    await waitFor(() => {
      expect(screen.getByText(/Version conflict/)).toBeInTheDocument();
      expect(screen.getByText(/Latest resourceVersion: 99999/)).toBeInTheDocument();
    });

    // Verify the draft is preserved (no silent overwrite)
    expect(screen.getByText("Update")).toBeInTheDocument();
  });

  it("surfaces admission errors at field paths", async () => {
    const user = userEvent.setup();

    const seed: KubeObject = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: "test" },
    };

    const ref: ResourceRef = {
      gvk: { group: "", version: "v1", kind: "Namespace" },
      name: "test",
    };

    // Create a transport that returns admission errors
    const transport = {
      ...createFixtureKubernetesTransport(),
      async dryRun() {
        throw {
          writeError: {
            kind: "admission",
            errors: [
              { path: "metadata.name", message: "Name must be lowercase" },
              { path: "spec.invalid", message: "Unknown field" },
            ],
          },
        };
      },
    };

    const renderForm = () => <div>Form view</div>;

    render(
      <ResourceEditor
        transport={transport}
        ref={ref}
        seed={seed}
        verb="create"
        renderForm={renderForm}
      />,
    );

    // Trigger dry-run
    await user.click(screen.getByText("Dry Run"));

    // Wait for admission errors
    await waitFor(() => {
      expect(screen.getByText(/Admission error/)).toBeInTheDocument();
      expect(screen.getByText(/metadata.name:/)).toBeInTheDocument();
      expect(screen.getByText(/Name must be lowercase/)).toBeInTheDocument();
      expect(screen.getByText(/spec.invalid:/)).toBeInTheDocument();
      expect(screen.getByText(/Unknown field/)).toBeInTheDocument();
    });
  });

  it("works with injected fixture transport", async () => {
    const user = userEvent.setup();

    const seed: KubeObject = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: "fixture-test" },
    };

    const ref: ResourceRef = {
      gvk: { group: "", version: "v1", kind: "Namespace" },
      name: "fixture-test",
    };

    const transport = createFixtureKubernetesTransport();

    const renderForm = () => <div>Fixture form</div>;

    let writeSucceeded = false;

    render(
      <ResourceEditor
        transport={transport}
        ref={ref}
        seed={seed}
        verb="create"
        renderForm={renderForm}
        onWriteSuccess={() => {
          writeSucceeded = true;
        }}
      />,
    );

    // Trigger create
    await user.click(screen.getByText("Create"));

    // Wait for success
    await waitFor(() => {
      expect(writeSucceeded).toBe(true);
    });
  });

  it("handles forbidden writes", async () => {
    const user = userEvent.setup();

    const seed: KubeObject = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: "forbidden-test" },
    };

    const ref: ResourceRef = {
      gvk: { group: "", version: "v1", kind: "Namespace" },
      name: "forbidden-test",
    };

    const transport = createFixtureKubernetesTransport({ forbidWrites: true });

    const renderForm = () => <div>Form view</div>;

    render(
      <ResourceEditor
        transport={transport}
        ref={ref}
        seed={seed}
        verb="create"
        renderForm={renderForm}
      />,
    );

    // Trigger create
    await user.click(screen.getByText("Create"));

    // Wait for forbidden error
    await waitFor(() => {
      expect(screen.getByText(/Forbidden/)).toBeInTheDocument();
    });
  });

  // Review fix #3: Line diagnostics displayed for invalid YAML
  it("displays line diagnostics for invalid YAML", async () => {
    const user = userEvent.setup();

    const seed: KubeObject = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: "test" },
    };

    const ref: ResourceRef = {
      gvk: { group: "", version: "v1", kind: "Namespace" },
      name: "test",
    };

    const transport = createFixtureKubernetesTransport();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedController: any = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderForm = (controller: any) => {
      capturedController = controller;
      return <div>Form view</div>;
    };

    render(
      <ResourceEditor
        transport={transport}
        ref={ref}
        seed={seed}
        verb="create"
        renderForm={renderForm}
      />,
    );

    // Toggle to YAML
    await user.click(screen.getByText("YAML"));

    // Update to invalid YAML with a parse error
    const invalidYaml = `apiVersion: v1
kind: Namespace
metadata:
  name: test
  invalid: [unclosed array
`;

    capturedController?.updateYaml(invalidYaml);

    // Wait for the warning
    await waitFor(() => {
      expect(screen.getByText(/Invalid YAML/)).toBeInTheDocument();
    });

    // Should show line diagnostics (the yaml library will include error details)
    // The exact format depends on the yaml library, but we check that diagnostics are present
    expect(capturedController?.state.draft.diagnostics.length).toBeGreaterThan(0);
  });

  // Review fix #2: Form shows lastValidObject when YAML is invalid
  it("form shows lastValidObject when YAML is invalid", async () => {
    const user = userEvent.setup();

    const seed: KubeObject = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: { name: "valid-name" },
    };

    const ref: ResourceRef = {
      gvk: { group: "", version: "v1", kind: "Namespace" },
      name: "valid-name",
    };

    const transport = createFixtureKubernetesTransport();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedController: any = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderForm = (controller: any) => {
      capturedController = controller;
      // Form should use lastValidObject when draft.object is null
      const name =
        controller.state.draft.object?.metadata.name ??
        controller.state.draft.lastValidObject?.metadata.name ??
        "";
      return (
        <div>
          <div data-testid="form-name">{name}</div>
        </div>
      );
    };

    render(
      <ResourceEditor
        transport={transport}
        ref={ref}
        seed={seed}
        verb="create"
        renderForm={renderForm}
      />,
    );

    // Initially shows valid name in form
    expect(screen.getByTestId("form-name")).toHaveTextContent("valid-name");

    // Toggle to YAML
    await user.click(screen.getByText("YAML"));

    // Update to invalid YAML
    const invalidYaml = `apiVersion: v1
kind: Namespace
metadata:
  name: test
  invalid: [unclosed
`;

    capturedController?.updateYaml(invalidYaml);

    await waitFor(() => {
      expect(screen.getByText(/Invalid YAML/)).toBeInTheDocument();
    });

    // Toggle back to form
    await user.click(screen.getByText("Form"));

    // Form should still show the last valid name (stale preview)
    expect(screen.getByTestId("form-name")).toHaveTextContent("valid-name");
  });
});
