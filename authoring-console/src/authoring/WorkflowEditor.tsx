/**
 * Workflow editor — combines schema-aware YAML editing with live CNCF diagram preview.
 *
 * Layout: editor beside preview on wide screens, preview behind a tab on narrow
 * screens. Invalid YAML stays editable and visibly stales the preview (never
 * discarded or reformatted). The portable workflow YAML is kept separate from
 * Kubernetes metadata.
 */
import { useState, useEffect, useMemo, type ReactNode } from "react";
import {
  Card,
  CardBody,
  PageSection,
  Grid,
  GridItem,
  Tab,
  TabContent,
  Tabs,
  TabTitleText,
  Alert,
} from "@patternfly/react-core";
import { parse as parseYaml } from "yaml";
import { YamlEditor } from "../editors/YamlEditor.tsx";
import { DiagramPreview } from "../editors/DiagramPreview.tsx";
import type { WorkflowDocument } from "../contracts/index.ts";

export interface WorkflowEditorProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly height?: string;
}

/**
 * Validates that the YAML is parseable and has a valid workflow document structure.
 * Returns the parsed document if valid, undefined otherwise.
 */
const validateWorkflowYaml = (yaml: string): WorkflowDocument | undefined => {
  if (!yaml.trim()) return undefined;
  try {
    const parsed = parseYaml(yaml) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "document" in parsed &&
      typeof parsed.document === "object" &&
      parsed.document !== null &&
      "name" in parsed.document &&
      "version" in parsed.document &&
      "dsl" in parsed.document
    ) {
      return parsed as WorkflowDocument;
    }
    return undefined;
  } catch {
    return undefined;
  }
};

/**
 * Layout breakpoint: use tabs below this width, side-by-side above.
 * Matches the DESIGN.md "narrow screen" convention (~tablet portrait).
 */
const NARROW_SCREEN_THRESHOLD = 1024;

export const WorkflowEditor = ({
  value,
  onChange,
  height = "600px",
}: WorkflowEditorProps): ReactNode => {
  const validDocument = useMemo(() => validateWorkflowYaml(value), [value]);
  const [isNarrowScreen, setIsNarrowScreen] = useState(
    window.innerWidth < NARROW_SCREEN_THRESHOLD,
  );
  const [activeTab, setActiveTab] = useState<"editor" | "diagram">("editor");

  useEffect(() => {
    const handleResize = (): void => {
      setIsNarrowScreen(window.innerWidth < NARROW_SCREEN_THRESHOLD);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isStale = !validDocument && value.trim().length > 0;

  const editorSection = (
    <Card isFullHeight>
      <CardBody>
        <YamlEditor
          value={value}
          workflowSchema
          readOnly={false}
          onChange={onChange}
          ariaLabel="Workflow YAML editor"
          height={height}
        />
      </CardBody>
    </Card>
  );

  const previewSection = (
    <Card isFullHeight>
      <CardBody>
        {isStale && (
          <Alert
            variant="warning"
            isInline
            title="Preview stale"
            style={{ marginBottom: "1rem" }}
          >
            The YAML is invalid. Fix syntax errors to update the diagram.
          </Alert>
        )}
        {validDocument ? (
          <DiagramPreview content={value} ariaLabel="Workflow diagram preview" />
        ) : (
          <div
            style={{
              height,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--pf-t--global--text--color--subtle)",
            }}
            aria-label="No valid workflow"
          >
            {value.trim() ? "Invalid YAML — fix errors to see diagram" : "Enter workflow YAML to see diagram"}
          </div>
        )}
      </CardBody>
    </Card>
  );

  if (isNarrowScreen) {
    // Narrow screen: tabs
    return (
      <PageSection>
        <Tabs
          activeKey={activeTab}
          onSelect={(_, key) => setActiveTab(key as "editor" | "diagram")}
          aria-label="Workflow editor tabs"
        >
          <Tab eventKey="editor" title={<TabTitleText>Workflow YAML</TabTitleText>} aria-label="Workflow YAML tab">
            <TabContent id="workflow-yaml-tab">{editorSection}</TabContent>
          </Tab>
          <Tab eventKey="diagram" title={<TabTitleText>Diagram</TabTitleText>} aria-label="Diagram tab">
            <TabContent id="diagram-tab">{previewSection}</TabContent>
          </Tab>
        </Tabs>
      </PageSection>
    );
  }

  // Wide screen: side-by-side
  return (
    <PageSection>
      <Grid hasGutter>
        <GridItem span={6} style={{minWidth: 0}}>{editorSection}</GridItem>
        <GridItem span={6} style={{minWidth: 0}}>{previewSection}</GridItem>
      </Grid>
    </PageSection>
  );
};
