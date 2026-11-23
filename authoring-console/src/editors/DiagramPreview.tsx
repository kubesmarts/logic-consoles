/**
 * CNCF diagram editor wrapper. Renders the portable workflow document read-only and
 * honours the resolved theme via the editor's `colorMode`. This is the real
 * `@openworkflowspec/diagram-editor` component; tests mock the leaf component while
 * the Playwright spike renders it for real in a browser.
 */
import { Component, type ReactNode } from "react";
import { Alert } from "@patternfly/react-core";
import { DiagramEditor } from "@openworkflowspec/diagram-editor";
import "@openworkflowspec/diagram-editor/styles.css";
import { useTheme } from "../app/theme.tsx";

export interface DiagramPreviewProps {
  /** Portable workflow document as a YAML or JSON string. */
  readonly content: string;
  readonly locale?: string;
  readonly ariaLabel?: string;
}

// The diagram package can throw on an incomplete task even when its YAML
// parses. Keep the editor mounted and retry when the author changes the source.
class DiagramBoundary extends Component<{content: string; children: ReactNode}, {content: string; failed: boolean}> {
  override state = {content: this.props.content, failed: false};

  static getDerivedStateFromError() { return {failed: true}; }

  static getDerivedStateFromProps(props: {content: string}, state: {content: string}) {
    return state.content === props.content ? null : {content: props.content, failed: false};
  }

  override render() {
    return this.state.failed
      ? <Alert isInline variant="warning" title="Diagram unavailable">Check the workflow tasks in YAML to update the preview.</Alert>
      : this.props.children;
  }
}

export const DiagramPreview = ({
  content,
  locale = "en",
  ariaLabel = "Workflow diagram preview",
}: DiagramPreviewProps): ReactNode => {
  const { resolved } = useTheme();
  return (
    <div data-testid="diagram-preview" aria-label={ariaLabel} style={{ height: "480px", width: "100%" }}>
      <DiagramBoundary content={content}>
        <DiagramEditor content={content} isReadOnly locale={locale} colorMode={resolved} />
      </DiagramBoundary>
    </div>
  );
};
