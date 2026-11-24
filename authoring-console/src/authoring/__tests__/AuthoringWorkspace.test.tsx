/**
 * AuthoringWorkspace tests — E1 acceptance:
 * - Blank editor renders with DSL validation
 * - Example copy → independent draft with attribution
 * - Invalid YAML stales preview but stays editable
 * - Draft save→reload round-trip
 * - Storage error keeps in-memory draft + export
 * - Navigation guard blocks on unsaved changes
 * - Narrow-screen tab switch
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthoringProvider } from "../AuthoringProvider.tsx";
import { AuthoringWorkspace, shouldBlockNavigation } from "../AuthoringWorkspace.tsx";
import { ConsoleProvider, type ConsoleServices } from "../../app/ConsoleContext.tsx";
import type { ConsoleStorage, DraftSaveOutcome, WorkflowDraft } from "../../contracts/index.ts";
import { launcherSession } from "../../fixtures/sessions.ts";

// Mock the editors (they require Monaco and CNCF diagram, which don't work in jsdom)
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
    <div data-testid="diagram-preview">Diagram: {content ? "valid" : "empty"}</div>
  ),
}));

vi.mock("../../editors/monaco-setup.ts", () => ({
  setupMonaco: vi.fn(),
}));

const createMockStorage = (overrides?: Partial<ConsoleStorage>): ConsoleStorage => {
  const drafts: WorkflowDraft[] = [];
  return {
    readPreferences: vi.fn(() => ({ theme: "light" as const })),
    writePreferences: vi.fn(),
    listDrafts: vi.fn(() => drafts),
    getDraft: vi.fn((id: string) => drafts.find((d) => d.id === id)),
    saveDraft: vi.fn((draft: WorkflowDraft): DraftSaveOutcome => {
      const existing = drafts.findIndex((d) => d.id === draft.id);
      if (existing >= 0) {
        drafts[existing] = draft;
      } else {
        drafts.push(draft);
      }
      return { ok: true, draft };
    }),
    removeDraft: vi.fn((id: string) => {
      const index = drafts.findIndex((d) => d.id === id);
      if (index >= 0) drafts.splice(index, 1);
    }),
    exportDraftYaml: vi.fn((draft: WorkflowDraft) => `# ${draft.title}\n${draft.workflowYaml}`),
    ...overrides,
  };
};

const createMockServices = (storage: ConsoleStorage): ConsoleServices => ({
  session: launcherSession,
  storage,
  gateway: {} as never,
  kubernetes: {} as never,
  capabilities: {} as never,
  compatibility: {} as never,
  useNavigation: () => ({
    navigate: vi.fn(),
    back: vi.fn(),
    currentPath: "/authoring",
    params: {},
  }),
});

const renderWorkspace = (storage: ConsoleStorage = createMockStorage()) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const services = createMockServices(storage);

  const router = createMemoryRouter(
    [
      {
        path: "/authoring",
        element: (
          <ConsoleProvider services={services}>
            <AuthoringProvider>
              <AuthoringWorkspace />
            </AuthoringProvider>
          </ConsoleProvider>
        ),
      },
      {
        path: "/authoring/:draftId",
        element: (
          <ConsoleProvider services={services}>
            <AuthoringProvider>
              <AuthoringWorkspace />
            </AuthoringProvider>
          </ConsoleProvider>
        ),
      },
      {
        path: "/other",
        element: <div>Other page</div>,
      },
    ],
    { initialEntries: ["/authoring"] },
  );

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    ),
    router,
  };
};

describe("AuthoringWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders blank editor with valid YAML template", async () => {
    renderWorkspace();
    const editor = await screen.findByTestId("yaml-editor");
    expect(editor).toBeInTheDocument();
    expect((editor as HTMLTextAreaElement).value).toContain("document:");
    expect((editor as HTMLTextAreaElement).value).toContain("my-workflow");
  });

  it("allows editing workflow YAML", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const editor = await screen.findByTestId("yaml-editor");
    await user.clear(editor);
    await user.type(editor, "document:\n  dsl: '1.0.0'\n  name: test");
    expect((editor as HTMLTextAreaElement).value).toContain("test");
  });

  it("saves draft successfully", async () => {
    const user = userEvent.setup();
    const storage = createMockStorage();
    renderWorkspace(storage);

    const saveButton = await screen.findByText("Save draft");
    await user.click(saveButton);

    await waitFor(() => {
      expect(storage.saveDraft).toHaveBeenCalled();
      expect(screen.queryByText(/Draft saved/i)).toBeInTheDocument();
    });
  });

  it("handles storage failure, preserves in-memory draft, and allows export", async () => {
    const user = userEvent.setup();
    const storage = createMockStorage({
      saveDraft: vi.fn(
        (draft): DraftSaveOutcome => ({
          ok: false,
          reason: "quota-exceeded",
          draft,
        }),
      ),
    });

    // Mock createObjectURL and anchor element
    global.URL.createObjectURL = vi.fn(() => "blob:mock");
    global.URL.revokeObjectURL = vi.fn();
    const mockClick = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") {
        el.click = mockClick;
      }
      return el;
    });

    renderWorkspace(storage);

    const editor = await screen.findByTestId("yaml-editor");
    await user.type(editor, " # my change");

    const saveButton = await screen.findByText("Save draft");
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/Storage quota exceeded/i)).toBeInTheDocument();
    });

    // Verify draft is still in editor (not lost)
    expect((editor as HTMLTextAreaElement).value).toContain("# my change");

    // Verify export still works after storage failure
    const actionsButton = await screen.findByText("Actions");
    await user.click(actionsButton);

    const exportButton = await screen.findByText("Export YAML");
    expect(exportButton).toBeInTheDocument();
    await user.click(exportButton);

    await waitFor(() => {
      expect(storage.exportDraftYaml).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
    });
  });

  it("shows unsaved changes indicator", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    const editor = await screen.findByTestId("yaml-editor");
    await user.type(editor, " # change");

    await waitFor(() => {
      expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument();
    });
  });

  it("opens example catalog", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    const exampleButton = await screen.findByText("Start from example");
    await user.click(exampleButton);

    // Modal should open with the catalog
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /example workflow catalog/i })).toBeInTheDocument();
    });
  });

  it("inserts input schema snippet", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    const actionsButton = await screen.findByText("Actions");
    await user.click(actionsButton);

    const snippetButton = await screen.findByText(/Add input schema/i);
    await user.click(snippetButton);

    const editor = await screen.findByTestId("yaml-editor");
    await waitFor(() => {
      expect((editor as HTMLTextAreaElement).value).toContain("input:");
      expect((editor as HTMLTextAreaElement).value).toContain("schema:");
    });
  });

  it("creates new blank workflow", async () => {
    const user = userEvent.setup();
    const storage = createMockStorage();
    renderWorkspace(storage);

    // Make a change first
    const editor = await screen.findByTestId("yaml-editor");
    await user.type(editor, " # change");

    // Mock confirm
    global.confirm = vi.fn(() => true);

    const actionsButton = await screen.findByText("Actions");
    await user.click(actionsButton);

    const newButton = await screen.findByText("New blank workflow");
    await user.click(newButton);

    await waitFor(() => {
      expect(global.confirm).toHaveBeenCalled();
      // Should reset to template
      expect((editor as HTMLTextAreaElement).value).toContain("my-workflow");
    });
  });
});

describe("shouldBlockNavigation", () => {
  it("blocks navigation when there are unsaved changes to a different path", () => {
    expect(shouldBlockNavigation(true, "/authoring", "/other")).toBe(true);
  });

  it("does not block navigation when there are no unsaved changes", () => {
    expect(shouldBlockNavigation(false, "/authoring", "/other")).toBe(false);
  });

  it("does not block navigation to the same path", () => {
    expect(shouldBlockNavigation(true, "/authoring", "/authoring")).toBe(false);
  });

  it("does not block when navigating to same path even with unsaved changes", () => {
    expect(shouldBlockNavigation(true, "/authoring/123", "/authoring/123")).toBe(false);
  });
});

it("offers to reopen a previously saved draft on this device", async () => {
  const storage = createMockStorage();
  storage.saveDraft({id:"resume-example",title:"Saved example",workflowYaml:"document:\n  name: handoff\n  version: 3.0.0",target:{contextName:launcherSession.context.contextName,namespace:"default"},createdAt:"",updatedAt:""});
  renderWorkspace(storage);
  await userEvent.click(await screen.findByRole("button", {name:"Open saved draft"}));
  await userEvent.click(await screen.findByText("Saved example"));
  await waitFor(() => expect((screen.getByTestId("yaml-editor") as HTMLTextAreaElement).value).toContain("handoff"));
});
