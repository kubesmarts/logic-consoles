/**
 * AuthoringProvider tests — verify useAuthoringContext returns live state.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthoringProvider, useAuthoringContext } from "../AuthoringProvider.tsx";
import { ConsoleProvider, type ConsoleServices } from "../../app/ConsoleContext.tsx";
import type { ConsoleStorage } from "../../contracts/index.ts";
import { launcherSession } from "../../fixtures/sessions.ts";

const createMockStorage = (): ConsoleStorage => ({
  readPreferences: vi.fn(() => ({ theme: "light" as const })),
  writePreferences: vi.fn(),
  listDrafts: vi.fn(() => []),
  getDraft: vi.fn(),
  saveDraft: vi.fn(),
  removeDraft: vi.fn(),
  exportDraftYaml: vi.fn(),
});

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

/**
 * Test component that consumes useAuthoringContext and displays its values.
 */
const TestConsumer = ({ onEdit }: { onEdit?: (yaml: string) => void }) => {
  const { workflowYaml, parsedIdentity, hasUnsavedChanges } = useAuthoringContext();

  return (
    <div>
      <div data-testid="workflow-yaml">{workflowYaml}</div>
      <div data-testid="parsed-identity">
        {parsedIdentity
          ? `${parsedIdentity.workflowName}@${parsedIdentity.version}`
          : "undefined"}
      </div>
      <div data-testid="has-unsaved-changes">{String(hasUnsavedChanges)}</div>
      {onEdit && (
        <button onClick={() => onEdit(workflowYaml + "\n# edited")}>Edit</button>
      )}
    </div>
  );
};

describe("useAuthoringContext", () => {
  it("returns initial blank workflow YAML", () => {
    const storage = createMockStorage();
    const services = createMockServices(storage);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <MemoryRouter initialEntries={["/authoring"]}>
        <QueryClientProvider client={queryClient}>
          <ConsoleProvider services={services}>
            <AuthoringProvider>
              <TestConsumer />
            </AuthoringProvider>
          </ConsoleProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );

    const yamlElement = screen.getByTestId("workflow-yaml");
    expect(yamlElement.textContent).toContain("my-workflow");
    expect(yamlElement.textContent).toContain("document:");
  });

  it("returns parsed workflow identity from valid YAML", () => {
    const storage = createMockStorage();
    const services = createMockServices(storage);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <MemoryRouter initialEntries={["/authoring"]}>
        <QueryClientProvider client={queryClient}>
          <ConsoleProvider services={services}>
            <AuthoringProvider>
              <TestConsumer />
            </AuthoringProvider>
          </ConsoleProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );

    const identityElement = screen.getByTestId("parsed-identity");
    expect(identityElement.textContent).toBe("my-workflow@1.0.0");
  });

  it("returns undefined parsed identity for invalid YAML", () => {
    const storage = createMockStorage();
    const invalidDraft = {
      id: "test-draft",
      title: "Test",
      workflowYaml: "invalid: [yaml",
      target: { contextName: "test", namespace: "default" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.getDraft = vi.fn(() => invalidDraft);

    const services = createMockServices(storage);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <MemoryRouter initialEntries={["/authoring/test-draft"]}>
        <QueryClientProvider client={queryClient}>
          <ConsoleProvider services={services}>
            <Routes>
              <Route
                path="/authoring/:draftId"
                element={
                  <AuthoringProvider>
                    <TestConsumer />
                  </AuthoringProvider>
                }
              />
            </Routes>
          </ConsoleProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );

    const identityElement = screen.getByTestId("parsed-identity");
    expect(identityElement.textContent).toBe("undefined");
  });

  it("returns hasUnsavedChanges=false initially", () => {
    const storage = createMockStorage();
    const services = createMockServices(storage);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <MemoryRouter initialEntries={["/authoring"]}>
        <QueryClientProvider client={queryClient}>
          <ConsoleProvider services={services}>
            <AuthoringProvider>
              <TestConsumer />
            </AuthoringProvider>
          </ConsoleProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );

    const unsavedElement = screen.getByTestId("has-unsaved-changes");
    expect(unsavedElement.textContent).toBe("false");
  });

  it("loads draft YAML from storage when draftId is provided", () => {
    const storage = createMockStorage();
    const draftData = {
      id: "draft-123",
      title: "My Draft",
      workflowYaml: `document:
  dsl: '1.0.0'
  namespace: default
  name: loaded-workflow
  version: '2.0.0'
do:
  - test: {}`,
      target: { contextName: "test", namespace: "default" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.getDraft = vi.fn(() => draftData);

    const services = createMockServices(storage);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    // Use Route with params to properly pass draftId
    render(
      <MemoryRouter initialEntries={["/authoring/draft-123"]}>
        <QueryClientProvider client={queryClient}>
          <ConsoleProvider services={services}>
            <Routes>
              <Route
                path="/authoring/:draftId"
                element={
                  <AuthoringProvider>
                    <TestConsumer />
                  </AuthoringProvider>
                }
              />
            </Routes>
          </ConsoleProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(storage.getDraft).toHaveBeenCalledWith("draft-123");

    const yamlElement = screen.getByTestId("workflow-yaml");
    expect(yamlElement.textContent).toContain("loaded-workflow");

    const identityElement = screen.getByTestId("parsed-identity");
    expect(identityElement.textContent).toBe("loaded-workflow@2.0.0");
  });
});
