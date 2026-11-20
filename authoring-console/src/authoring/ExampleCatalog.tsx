/**
 * Example catalog — select and copy an example to start authoring.
 *
 * Shows examples from the pinned upstream catalog with license, source links, and
 * labeled prerequisites. Copying an example produces an independent editable draft
 * (no live link back to the catalog). Catalog loads with the app (offline).
 */
import type { ReactNode } from "react";
import {
  Card,
  CardBody,
  CardTitle,
  Content,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Button,
  Flex,
  FlexItem,
} from "@patternfly/react-core";
import { ExternalLinkAltIcon } from "@patternfly/react-icons";
import { EXAMPLES_CATALOG, type WorkflowExample } from "./examples-catalog.ts";

export interface ExampleCatalogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSelectExample: (yaml: string, title: string) => void;
}

const ExampleCard = ({
  example,
  onSelect,
}: {
  readonly example: WorkflowExample;
  readonly onSelect: () => void;
}): ReactNode => (
  <Card isClickable onClick={onSelect}>
    <CardTitle>{example.title}</CardTitle>
    <CardBody>
      <Content component="p" style={{ marginBottom: "0.5rem" }}>
        {example.description}
      </Content>
      {example.prerequisites.length > 0 && (
        <div style={{ marginTop: "0.5rem" }}>
          <Content component="small" style={{ display: "block", marginBottom: "0.25rem" }}>
            Prerequisites:
          </Content>
          <Flex spaceItems={{ default: "spaceItemsXs" }}>
            {example.prerequisites.map((prereq) => (
              <FlexItem key={prereq}>
                <Label color="orange" isCompact>
                  {prereq}
                </Label>
              </FlexItem>
            ))}
          </Flex>
        </div>
      )}
      <div style={{ marginTop: "0.75rem" }}>
        <Content component="small">
          <a
            href={example.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ marginRight: "1rem" }}
          >
            Source <ExternalLinkAltIcon />
          </a>
          License: {example.license}
        </Content>
      </div>
    </CardBody>
  </Card>
);

export const ExampleCatalog = ({
  isOpen,
  onClose,
  onSelectExample,
}: ExampleCatalogProps): ReactNode => {
  const handleSelect = (example: WorkflowExample): void => {
    onSelectExample(example.yaml, example.title);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      aria-label="Example workflow catalog"
      variant="large"
    >
      <ModalHeader title="Start from example" />
      <ModalBody>
        <Content component="p" style={{ marginBottom: "1rem" }}>
          Select an example to start editing. Each example is an independent copy you can modify freely.
        </Content>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "1rem",
          }}
        >
          {EXAMPLES_CATALOG.map((example) => (
            <ExampleCard
              key={example.id}
              example={example}
              onSelect={() => handleSelect(example)}
            />
          ))}
        </div>
        <Content component="p" style={{ marginTop: "1rem", fontSize: "0.875rem", color: "var(--pf-t--global--text--color--subtle)" }}>
          Examples from{" "}
          <a
            href="https://github.com/open-workflow-specification/specification/tree/main/examples"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Workflow Specification <ExternalLinkAltIcon />
          </a>
          . All examples licensed under Apache 2.0.
        </Content>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};
