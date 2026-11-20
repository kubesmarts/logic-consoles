/**
 * Monaco + monaco-yaml bootstrap (browser only).
 *
 * Wires the base editor worker and the YAML language worker as bundled ES-module
 * workers (Vite `?worker` imports), points @monaco-editor/react at the bundled
 * `monaco-editor` instance instead of a CDN, and enables schema-aware YAML with the
 * Open Workflow Specification DSL schema (pinned from upstream main @ 2026-11-20).
 *
 * This module is imported for its browser behaviour; tests mock @monaco-editor/react
 * and this module so the worker imports are never evaluated under jsdom.
 */
import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import { configureMonacoYaml } from "monaco-yaml";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker.js?worker";
import YamlWorker from "monaco-yaml/yaml.worker.js?worker";

let configured = false;

/**
 * Fetches and parses the OWS DSL schema from the bundled public directory.
 * Falls back to basic validation if the schema cannot be loaded.
 */
const loadWorkflowSchema = async (): Promise<unknown | undefined> => {
  try {
    const response = await fetch("/schemas/workflow-dsl-1.0.0.yaml");
    if (!response.ok) return undefined;
    const yamlText = await response.text();
    // Parse YAML to JSON for monaco-yaml (it expects JSON schema)
    const { parse } = await import("yaml");
    return parse(yamlText);
  } catch {
    return undefined;
  }
};

export const setupMonaco = async (): Promise<void> => {
  if (configured) return;
  configured = true;

  self.MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      if (label === "yaml") {
        return new YamlWorker();
      }
      return new EditorWorker();
    },
  };

  loader.config({ monaco });

  // Load the OWS DSL schema asynchronously
  const dslSchema = await loadWorkflowSchema();

  configureMonacoYaml(monaco, {
    enableSchemaRequest: false,
    validate: true,
    hover: true,
    completion: true,
    schemas: dslSchema
      ? [
          {
            uri: "https://open-workflow-specification.org/schemas/1.1.0/workflow.yaml",
            fileMatch: ["**/*.yaml", "**/*.yml"],
            schema: dslSchema,
          },
        ]
      : [],
  });
};
