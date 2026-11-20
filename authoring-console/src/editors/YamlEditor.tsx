/**
 * Schema-aware YAML editor wrapper around Monaco. Honours the resolved theme and
 * keeps editing keyboard-accessible. Read-only by default for resource YAML views;
 * authoring screens (packet E) pass a change handler.
 */
import { useEffect, type ReactNode } from "react";
import Editor from "@monaco-editor/react";
import { setupMonaco } from "./monaco-setup.ts";
import { useTheme } from "../app/theme.tsx";

export interface YamlEditorProps {
  readonly value: string;
  readonly readOnly?: boolean;
  readonly ariaLabel: string;
  readonly height?: string;
  onChange?(next: string): void;
}

export const YamlEditor = ({
  value,
  readOnly = true,
  ariaLabel,
  height = "480px",
  onChange,
}: YamlEditorProps): ReactNode => {
  const { resolved } = useTheme();

  useEffect(() => {
    setupMonaco();
  }, []);

  return (
    <div data-testid="yaml-editor" aria-label={ariaLabel} style={{ height }}>
      <Editor
        language="yaml"
        theme={resolved === "dark" ? "vs-dark" : "vs"}
        value={value}
        onChange={(next) => onChange?.(next ?? "")}
        options={{
          readOnly,
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
