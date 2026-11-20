/**
 * Fixture-backed workflow list (M1 reference screen).
 *
 * Families are grouped by effective namespace + workflow document name, each with a
 * name link, runtime link and version count. Opening a family reveals its versions;
 * selecting a version establishes the target and opens its detail page.
 */
import { useState, type ReactNode } from "react";
import {
  Bullseye,
  Button,
  Content,
  EmptyState,
  EmptyStateBody,
  PageSection,
  Spinner,
  Title,
} from "@patternfly/react-core";
import {
  ExpandableRowContent,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@patternfly/react-table";
import { NamespaceBar } from "../shell/NamespaceBar.tsx";
import { useNavigation } from "../ConsoleContext.tsx";
import { useWorkflowFamilies, type WorkflowFamily } from "../queries.ts";

const versionHref = (family: WorkflowFamily, version: string): string =>
  `/workflows/${encodeURIComponent(family.key.namespace)}/${encodeURIComponent(family.key.workflowName)}/${encodeURIComponent(version)}`;

export const WorkflowsPage = (): ReactNode => {
  const { navigate } = useNavigation();
  const { data, isPending, isError } = useWorkflowFamilies();
  const [expanded, setExpanded] = useState<Readonly<Record<string, boolean>>>({});

  const toggle = (key: string): void =>
    setExpanded((current) => ({ ...current, [key]: !current[key] }));

  return (
    <>
      <NamespaceBar />
      <PageSection>
        <Title headingLevel="h1">Workflows</Title>
        <Content component="p">Deployed workflow families, grouped by namespace and document name.</Content>
        <Button
          variant="primary"
          onClick={() => navigate("/authoring")}
          style={{ marginTop: "1rem" }}
        >
          Create workflow
        </Button>
      </PageSection>
      <PageSection>
        {isPending ? (
          <Bullseye>
            <Spinner aria-label="Loading workflows" />
          </Bullseye>
        ) : isError ? (
          <EmptyState titleText="Workflows unavailable" headingLevel="h2" status="danger">
            <EmptyStateBody>The gateway catalog could not be read.</EmptyStateBody>
          </EmptyState>
        ) : data && data.length > 0 ? (
          <Table aria-label="Workflow families" variant="compact">
            <Thead>
              <Tr>
                <Th screenReaderText="Expand" />
                <Th>Name</Th>
                <Th>Runtime</Th>
                <Th>Versions</Th>
              </Tr>
            </Thead>
            {data.map((family, rowIndex) => {
              const familyKey = `${family.key.namespace}/${family.key.workflowName}`;
              const isExpanded = Boolean(expanded[familyKey]);
              return (
                <Tbody key={familyKey} isExpanded={isExpanded}>
                  <Tr>
                    <Td
                      expand={{
                        rowIndex,
                        isExpanded,
                        onToggle: () => toggle(familyKey),
                        expandId: `expand-${familyKey}`,
                      }}
                    />
                    <Td dataLabel="Name">{family.key.workflowName}</Td>
                    <Td dataLabel="Runtime">{family.runtimeName ?? "—"}</Td>
                    <Td dataLabel="Versions">{family.versions.length}</Td>
                  </Tr>
                  <Tr isExpanded={isExpanded}>
                    <Td />
                    <Td dataLabel="Deployed versions" colSpan={3}>
                      <ExpandableRowContent>
                        {family.versions.map((row) => (
                          <Button
                            key={row.version.version}
                            variant="link"
                            isInline
                            onClick={() => navigate(versionHref(family, row.version.version))}
                          >
                            {row.version.version}
                          </Button>
                        ))}
                      </ExpandableRowContent>
                    </Td>
                  </Tr>
                </Tbody>
              );
            })}
          </Table>
        ) : (
          <EmptyState titleText="No workflows" headingLevel="h2">
            <EmptyStateBody>No workflows are deployed in this namespace.</EmptyStateBody>
          </EmptyState>
        )}
      </PageSection>
    </>
  );
};
