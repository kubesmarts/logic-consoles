/**
 * CNCF diagram editor wrapper. Renders the portable workflow document read-only and
 * honours the resolved theme via the editor's `colorMode`. This is the real
 * `@openworkflowspec/diagram-editor` component; tests mock the leaf component while
 * the Playwright spike renders it for real in a browser.
 */
import type { ReactNode } from "react";
import { DiagramEditor } from "@openworkflowspec/diagram-editor";
import "@openworkflowspec/diagram-editor/styles.css";
import { useTheme } from "../app/theme.tsx";

export interface DiagramPreviewProps {
  /** Portable workflow document as a YAML or JSON string. */
  readonly content: string;
  readonly locale?: string;
  readonly ariaLabel?: string;
}

export const DiagramPreview = ({
  content,
  locale = "en",
  ariaLabel = "Workflow diagram preview",
}: DiagramPreviewProps): ReactNode => {
  const { resolved } = useTheme();
  return (
    <div data-testid="diagram-preview" aria-label={ariaLabel} style={{ height: "480px", width: "100%" }}>
      <DiagramEditor content={content} isReadOnly locale={locale} colorMode={resolved} />
    </div>
  );
};
