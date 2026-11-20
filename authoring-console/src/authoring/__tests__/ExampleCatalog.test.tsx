/**
 * ExampleCatalog tests — verify example copy produces independent draft with attribution.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExampleCatalog } from "../ExampleCatalog.tsx";

describe("ExampleCatalog", () => {
  it("renders catalog with examples", () => {
    const onClose = vi.fn();
    const onSelectExample = vi.fn();
    render(<ExampleCatalog isOpen={true} onClose={onClose} onSelectExample={onSelectExample} />);

    expect(screen.getByText("Start from example")).toBeInTheDocument();
    expect(screen.getByText("Hello World")).toBeInTheDocument();
    expect(screen.getByText("Greeting with Input")).toBeInTheDocument();
  });

  it("shows license and source links for each example", () => {
    const onClose = vi.fn();
    const onSelectExample = vi.fn();
    render(<ExampleCatalog isOpen={true} onClose={onClose} onSelectExample={onSelectExample} />);

    // All examples should show Apache 2.0
    const licenseTexts = screen.getAllByText(/Apache 2.0/i);
    expect(licenseTexts.length).toBeGreaterThan(0);

    // Should have source links
    const sourceLinks = screen.getAllByText(/Source/i);
    expect(sourceLinks.length).toBeGreaterThan(0);
  });

  it("shows prerequisites labels for examples requiring them", () => {
    const onClose = vi.fn();
    const onSelectExample = vi.fn();
    render(<ExampleCatalog isOpen={true} onClose={onClose} onSelectExample={onSelectExample} />);

    // HTTP example should show prerequisites
    expect(screen.getByText("Network access")).toBeInTheDocument();
    expect(screen.getByText("HTTP endpoint")).toBeInTheDocument();
  });

  it("calls onSelectExample with YAML when example is selected", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSelectExample = vi.fn();
    render(<ExampleCatalog isOpen={true} onClose={onClose} onSelectExample={onSelectExample} />);

    const helloWorldCard = screen.getByText("Hello World").closest("[class*='pf-v6-c-card']");
    expect(helloWorldCard).toBeInTheDocument();

    await user.click(helloWorldCard!);

    await waitFor(() => {
      expect(onSelectExample).toHaveBeenCalledWith(
        expect.stringContaining("hello-world"),
        "Hello World",
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("closes when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSelectExample = vi.fn();
    render(<ExampleCatalog isOpen={true} onClose={onClose} onSelectExample={onSelectExample} />);

    const cancelButton = screen.getByText("Cancel");
    await user.click(cancelButton);

    expect(onClose).toHaveBeenCalled();
    expect(onSelectExample).not.toHaveBeenCalled();
  });

  it("shows upstream attribution", () => {
    const onClose = vi.fn();
    const onSelectExample = vi.fn();
    render(<ExampleCatalog isOpen={true} onClose={onClose} onSelectExample={onSelectExample} />);

    expect(screen.getByText(/Open Workflow Specification/i)).toBeInTheDocument();
    // Should show attribution footer
    expect(screen.getByText(/All examples licensed under Apache 2.0/i)).toBeInTheDocument();
  });

  it("does not render when isOpen is false", () => {
    const onClose = vi.fn();
    const onSelectExample = vi.fn();
    render(<ExampleCatalog isOpen={false} onClose={onClose} onSelectExample={onSelectExample} />);

    expect(screen.queryByText("Start from example")).not.toBeInTheDocument();
  });
});
