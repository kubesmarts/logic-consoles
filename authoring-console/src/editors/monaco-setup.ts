/**
 * Monaco + monaco-yaml bootstrap (browser only).
 *
 * Wires the base editor worker and the YAML language worker as bundled ES-module
 * workers (Vite `?worker` imports), points @monaco-editor/react at the bundled
 * `monaco-editor` instance instead of a CDN, and enables schema-aware YAML. This
 * module is imported for its browser behaviour; tests mock @monaco-editor/react and
 * this module so the worker imports are never evaluated under jsdom.
 */
import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import { configureMonacoYaml } from "monaco-yaml";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker.js?worker";
import YamlWorker from "monaco-yaml/yaml.worker.js?worker";

let configured = false;

export const setupMonaco = (): void => {
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

  configureMonacoYaml(monaco, {
    enableSchemaRequest: false,
    validate: true,
    hover: true,
    completion: true,
    // Schema wiring (DSL schema association) is a later packet's concern; this proves
    // the YAML language service loads and the worker is bundled.
    schemas: [],
  });
};
