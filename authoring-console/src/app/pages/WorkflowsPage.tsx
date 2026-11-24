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
  Flex,
  SearchInput,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
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
import { useConsole, useNavigation } from "../ConsoleContext.tsx";
import { useWorkflowFamilies, type WorkflowFamily } from "../queries.ts";

const versionHref = (family: WorkflowFamily, version: string): string =>
  `/workflows/${encodeURIComponent(family.key.namespace)}/${encodeURIComponent(family.key.workflowName)}/${encodeURIComponent(version)}`;

export const WorkflowsPage = (): ReactNode => {
  const { navigate } = useNavigation();
  const { session } = useConsole();
  const [filter, setFilter] = useState("");
  const { data, isPending, isError } = useWorkflowFamilies();
  const [expanded, setExpanded] = useState<Readonly<Record<string, boolean>>>({});

  const visibleFamilies = data?.filter(family => family.key.workflowName.toLowerCase().includes(filter.trim().toLowerCase()));

  const toggle = (key: string): void =>
    setExpanded((current) => ({ ...current, [key]: !current[key] }));

  return (
    <>
      <NamespaceBar namespace={session.namespace ?? "default"} />
      <PageSection isFilled={false}>
        <Flex alignItems={{ default: "alignItemsCenter" }} justifyContent={{ default: "justifyContentSpaceBetween" }}>
          <Title headingLevel="h1">Workflows</Title>
          <Button variant="primary" className="console-primary-action" onClick={() => navigate("/authoring")}>Create workflow</Button>
        </Flex>
      </PageSection>
      <PageSection>
        <Toolbar aria-label="Workflow filters" inset={{ default: "insetNone" }}>
          <ToolbarContent><ToolbarItem>
            <SearchInput aria-label="Filter workflows by name" placeholder="Filter by name" value={filter}
              onChange={(_, value) => setFilter(value)} onClear={() => setFilter("")} />
          </ToolbarItem></ToolbarContent>
        </Toolbar>
        {isPending ? (
          <Bullseye>
            <Spinner aria-label="Loading workflows" />
          </Bullseye>
        ) : isError ? (
          <EmptyState titleText="Workflows unavailable" headingLevel="h2" status="danger">
            <EmptyStateBody>The gateway catalog could not be read.</EmptyStateBody>
          </EmptyState>
        ) : visibleFamilies && visibleFamilies.length > 0 ? (
          <Table aria-label="Workflow families" variant="compact">
            <Thead>
              <Tr>
                <Th screenReaderText="Expand" />
                <Th>Name</Th>
                <Th>Runtime</Th>
                <Th>Versions</Th>
              </Tr>
            </Thead>
            {visibleFamilies.map((family, rowIndex) => {
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
                        <Flex>
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
                        </Flex>
                      </ExpandableRowContent>
                    </Td>
                  </Tr>
                </Tbody>
              );
            })}
          </Table>
        ) : data?.length ? (
          <EmptyState titleText="No matching workflows" headingLevel="h2">
            <Button variant="link" onClick={() => setFilter("")}>Clear filter</Button>
          </EmptyState>
        ) : (
          <EmptyState titleText="No workflows" headingLevel="h2">
            <EmptyStateBody>No workflows are deployed in this namespace.</EmptyStateBody>
          </EmptyState>
        )}
      </PageSection>
    </>
  );
};
