/**
 * WorkflowEditor tests — verify invalid YAML stales preview but stays editable.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowEditor } from "../WorkflowEditor.tsx";

// Mock the editors
vi.mock("../../editors/YamlEditor.tsx", () => ({
  YamlEditor: ({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel: string }) => (
    <textarea
      data-testid="yaml-editor"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock("../../editors/DiagramPreview.tsx", () => ({
  DiagramPreview: ({ content }: { content: string }) => (
    <div data-testid="diagram-preview">Preview of: {content.substring(0, 50)}</div>
  ),
}));

vi.mock("../../editors/monaco-setup.ts", () => ({
  setupMonaco: vi.fn(),
}));

const validYaml = `document:
  dsl: '1.0.0'
  namespace: default
  name: test-workflow
  version: '1.0.0'
do:
  - step1:
      set:
        result: "test"
`;

const invalidYaml = `document:
  dsl: '1.0.0'
  namespace: [this is invalid
  name: test
`;

describe("WorkflowEditor", () => {
  it("renders editor and preview", () => {
    const onChange = vi.fn();
    render(<WorkflowEditor value={validYaml} onChange={onChange} />);

    expect(screen.getByTestId("yaml-editor")).toBeInTheDocument();
    expect(screen.getByTestId("diagram-preview")).toBeInTheDocument();
  });

  it("shows valid preview for valid YAML", () => {
    const onChange = vi.fn();
    render(<WorkflowEditor value={validYaml} onChange={onChange} />);

    const preview = screen.getByTestId("diagram-preview");
    expect(preview).toBeInTheDocument();
    expect(screen.queryByText(/Preview stale/i)).not.toBeInTheDocument();
  });

  it("shows stale indicator for invalid YAML but keeps editor usable", () => {
    const onChange = vi.fn();
    const { rerender } = render(<WorkflowEditor value={invalidYaml} onChange={onChange} />);

    // Should show stale warning
    expect(screen.getByText(/Preview stale/i)).toBeInTheDocument();
    expect(screen.getByText(/invalid.*fix syntax/i)).toBeInTheDocument();

    // Editor should still be editable
    const editor = screen.getByTestId("yaml-editor");
    expect(editor).toBeInTheDocument();
    expect((editor as HTMLTextAreaElement).value).toBe(invalidYaml);

    // Should recover when YAML becomes valid
    rerender(<WorkflowEditor value={validYaml} onChange={onChange} />);
    expect(screen.queryByText(/Preview stale/i)).not.toBeInTheDocument();
  });

  it("recovers preview when YAML becomes valid again", () => {
    const onChange = vi.fn();
    const { rerender } = render(<WorkflowEditor value={invalidYaml} onChange={onChange} />);

    // Should show stale
    expect(screen.getByText(/Preview stale/i)).toBeInTheDocument();

    // Rerender with valid YAML
    rerender(<WorkflowEditor value={validYaml} onChange={onChange} />);

    // Stale indicator should disappear
    expect(screen.queryByText(/Preview stale/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("diagram-preview")).toBeInTheDocument();
  });

  it("calls onChange when editing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WorkflowEditor value={validYaml} onChange={onChange} />);

    const editor = screen.getByTestId("yaml-editor");
    await user.type(editor, "x");

    expect(onChange).toHaveBeenCalled();
  });

  it("shows empty state when no YAML", () => {
    const onChange = vi.fn();
    render(<WorkflowEditor value="" onChange={onChange} />);

    expect(screen.getByText(/Enter workflow YAML to see diagram/i)).toBeInTheDocument();
  });

  it("switches to tabbed layout on narrow screens", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    // Mock narrow screen width
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 800, // Below 1024px threshold
    });

    render(<WorkflowEditor value={validYaml} onChange={onChange} />);

    // Should show tabs instead of side-by-side
    const yamlTab = screen.getByRole("tab", { name: /Workflow YAML/i });
    const diagramTab = screen.getByRole("tab", { name: /Diagram/i });

    expect(yamlTab).toBeInTheDocument();
    expect(diagramTab).toBeInTheDocument();

    // Switch to diagram tab
    await user.click(diagramTab);

    // Both tabs should still be visible
    expect(yamlTab).toBeInTheDocument();
    expect(diagramTab).toBeInTheDocument();
  });

  it("uses side-by-side layout on wide screens", () => {
    const onChange = vi.fn();

    // Mock wide screen width
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1920, // Above 1024px threshold
    });

    render(<WorkflowEditor value={validYaml} onChange={onChange} />);

    // Should NOT show tabs
    expect(screen.queryByRole("tab", { name: /Workflow YAML/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Diagram/i })).not.toBeInTheDocument();

    // Both editor and preview should be visible side-by-side
    expect(screen.getByTestId("yaml-editor")).toBeInTheDocument();
    expect(screen.getByTestId("diagram-preview")).toBeInTheDocument();
  });
});
