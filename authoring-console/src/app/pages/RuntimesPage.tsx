/**
 * Runtimes screen (read stub): lists LogicFlowRuntime objects in the active namespace
 * with persistence mode. Create/edit wizards are packet D.
 */
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bullseye,
  EmptyState,
  EmptyStateBody,
  PageSection,
  Spinner,
  Title,
} from "@patternfly/react-core";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
import { NamespaceBar } from "../shell/NamespaceBar.tsx";
import { useConsole } from "../ConsoleContext.tsx";
import {
  DEFAULT_PERSISTENCE_MODE,
  LOGIC_GROUP,
  LOGIC_VERSION,
  LogicKinds,
  type LogicFlowRuntimeSpec,
} from "../../contracts/index.ts";

export const RuntimesPage = (): ReactNode => {
  const { session, kubernetes } = useConsole();
  const namespace = session.namespace ?? "default";
  const query = useQuery({
    queryKey: [session.sessionId, session.context.contextName, "runtimes", namespace],
    queryFn: ({ signal }) =>
      kubernetes.list<LogicFlowRuntimeSpec>(
        { group: LOGIC_GROUP, version: LOGIC_VERSION, kind: LogicKinds.LogicFlowRuntime },
        { namespace },
        signal,
      ),
  });

  return (
    <>
      <NamespaceBar />
      <PageSection>
        <Title headingLevel="h1">Runtimes</Title>
      </PageSection>
      <PageSection>
        {query.isPending ? (
          <Bullseye>
            <Spinner aria-label="Loading runtimes" />
          </Bullseye>
        ) : query.isError ? (
          <EmptyState titleText="Runtimes unavailable" headingLevel="h2" status="danger">
            <EmptyStateBody>Runtimes could not be read.</EmptyStateBody>
          </EmptyState>
        ) : query.data && query.data.items.length > 0 ? (
          <Table aria-label="Runtimes" variant="compact">
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Persistence mode</Th>
              </Tr>
            </Thead>
            <Tbody>
              {query.data.items.map((runtime) => (
                <Tr key={runtime.metadata.name}>
                  <Td dataLabel="Name">{runtime.metadata.name}</Td>
                  <Td dataLabel="Persistence mode">
                    {runtime.spec?.persistenceMode ?? DEFAULT_PERSISTENCE_MODE}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        ) : (
          <EmptyState titleText="No runtimes" headingLevel="h2">
            <EmptyStateBody>No runtimes exist in this namespace.</EmptyStateBody>
          </EmptyState>
        )}
      </PageSection>
    </>
  );
};
