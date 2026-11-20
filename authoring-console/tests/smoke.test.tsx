/**
 * M1 UI smoke test (acceptance): render the fixture-backed workflow list, select a
 * version, open its detail page, and mount the YAML editor + CNCF preview together.
 * Also verifies the CR-name ≠ workflow-name case is surfaced in Details.
 *
 * Monaco and the CNCF diagram editor are browser-only (canvas / web workers), so their
 * leaf components are mocked here; the REAL components are proven in a browser by the
 * Playwright spike (e2e/spike.spec.ts). Everything else — routing, the PatternFly
 * shell, the gateway catalog over MSW, Kubernetes CR resolution — runs for real.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@monaco-editor/react", () => ({
  default: ({ value, options }: { value?: string; options?: { ariaLabel?: string } }) => (
    <textarea data-testid="monaco" aria-label={options?.ariaLabel} value={value ?? ""} readOnly />
  ),
}));
vi.mock("../src/editors/monaco-setup.ts", () => ({ setupMonaco: () => {} }));
vi.mock("@openworkflowspec/diagram-editor", () => ({
  DiagramEditor: ({ content }: { content: string }) => <div data-testid="cncf-editor">{content}</div>,
}));

import { App } from "../src/app/App.tsx";
import type { ConsoleServices } from "../src/app/ConsoleContext.tsx";
import { createConsoleStorage } from "../src/app/storage.ts";
import { createFetchGatewayTransport } from "../src/fixtures/gateway-transport.ts";
import { createFixtureKubernetesTransport } from "../src/fixtures/transports/kubernetes.ts";
import { createFixtureCapabilityTransport } from "../src/fixtures/transports/capabilities.ts";
import { launcherSession } from "../src/fixtures/sessions.ts";
import { devBaselineCompatibilityManifest } from "../src/fixtures/compatibility-baseline.ts";

const makeServices = (): ConsoleServices => ({
  session: launcherSession,
  gateway: createFetchGatewayTransport(),
  kubernetes: createFixtureKubernetesTransport(),
  capabilities: createFixtureCapabilityTransport("cluster-admin"),
  storage: createConsoleStorage(),
  compatibility: devBaselineCompatibilityManifest,
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App services={makeServices()} />
    </MemoryRouter>,
  );

beforeEach(() => {
  window.localStorage.clear();
});

describe("workflow list → version detail", () => {
  it("lists families, selects a version, and mounts YAML + CNCF preview together", async () => {
    const user = userEvent.setup();
    renderAt("/workflows");

    // The fixture-backed list renders the hello-world family.
    const nameCell = await screen.findByText("hello-world");
    const familyRow = nameCell.closest("tr");
    expect(familyRow).not.toBeNull();

    // Opening the family reveals its two versions.
    const expandToggle = within(familyRow as HTMLElement).getByRole("button");
    await user.click(expandToggle);
    const versionButton = await screen.findByRole("button", { name: "1.0.0" });
    await user.click(versionButton);

    // Details tab shows the CR name, distinct from the workflow identity.
    expect(await screen.findByTestId("cr-name")).toHaveTextContent("hello-world-v-1-0-0");

    // Diagram tab mounts the CNCF preview on spec.flow.
    await user.click(screen.getByRole("tab", { name: "Diagram" }));
    const cncf = await screen.findByTestId("cncf-editor");
    expect(cncf).toHaveTextContent("hello-world");

    // YAML tab mounts Monaco on the full CR.
    await user.click(screen.getByRole("tab", { name: "YAML" }));
    const monaco = await screen.findByTestId("monaco");
    expect(monaco).toHaveAttribute("aria-label", "Full definition CR YAML");
  });

  it("surfaces a CR name that differs from the workflow name", async () => {
    renderAt("/workflows/default/payments/2.1.0");
    // payments @ 2.1.0 is a hand-authored CR named legacy-payment-flow.
    expect(await screen.findByTestId("cr-name")).toHaveTextContent("legacy-payment-flow");
  });
});
