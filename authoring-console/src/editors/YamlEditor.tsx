/**
 * Schema-aware YAML editor wrapper around Monaco. Honours the resolved theme and
 * keeps editing keyboard-accessible. Read-only by default for resource YAML views;
 * authoring screens (packet E) pass a change handler.
 */
import { useEffect, useId, type ReactNode } from "react";
import Editor from "@monaco-editor/react";
import { setupMonaco } from "./monaco-setup.ts";
import { useTheme } from "../app/theme.tsx";

export interface YamlEditorProps {
  readonly value: string;
  readonly readOnly?: boolean;
  readonly workflowSchema?: boolean;
  readonly foldManagedFields?: boolean;
  readonly ariaLabel: string;
  readonly height?: string;
  onChange?(next: string): void;
}

export const YamlEditor = ({
  value,
  readOnly = true,
  workflowSchema = false,
  foldManagedFields = false,
  ariaLabel,
  height = "480px",
  onChange,
}: YamlEditorProps): ReactNode => {
  const modelId = useId();
  const { resolved } = useTheme();

  useEffect(() => {
    void setupMonaco();
  }, []);

  return (
    <div data-testid="yaml-editor" aria-label={ariaLabel} style={{ height }}>
      <Editor
        path={`inmemory://console/${modelId}.${workflowSchema ? "workflow.yaml" : "yaml"}`}
        language="yaml"
        theme={resolved === "dark" ? "vs-dark" : "vs"}
        value={value}
        onMount={(editor) => {
          if (!foldManagedFields) return;
          const lines = editor.getModel()?.getLinesContent() ?? [];
          const metadata = lines.indexOf("metadata:");
          if (metadata === -1) return;
          for (let index = metadata + 1; lines[index]?.startsWith(" "); index++) {
            if (lines[index] === "  managedFields:") {
              editor.trigger("resource-view", "editor.fold", { selectionLines: [index], levels: 1, direction: "down" });
              break;
            }
          }
        }}
        onChange={(next) => onChange?.(next ?? "")}
        options={{
          readOnly,
          foldingStrategy: foldManagedFields ? "indentation" : "auto",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 13,
          automaticLayout: true,
          ariaLabel,
        }}
      />
    </div>
  );
};
