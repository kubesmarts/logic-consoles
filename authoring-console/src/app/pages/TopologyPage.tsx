/**
 * Topology screen (read stub): mounts React Flow on the gateway topology. A partial
 * graph keeps its available nodes and surfaces a warning; richer selection/drawer
 * behaviour is packet F.
 */
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Bullseye,
  EmptyState,
  EmptyStateBody,
  PageSection,
  Spinner,
  Title,
} from "@patternfly/react-core";
import { NamespaceBar } from "../shell/NamespaceBar.tsx";
import { TopologyCanvas } from "../../editors/TopologyCanvas.tsx";
import { useConsole } from "../ConsoleContext.tsx";

export const TopologyPage = (): ReactNode => {
  const { session, gateway } = useConsole();
  const namespace = session.namespace ?? "default";
  const query = useQuery({
    queryKey: [session.sessionId, session.context.contextName, "topology", namespace],
    queryFn: ({ signal }) => gateway.getTopology(namespace, signal),
  });

  return (
    <>
      <NamespaceBar />
      <PageSection>
        <Title headingLevel="h1">Topology</Title>
      </PageSection>
      <PageSection>
        {query.isPending ? (
          <Bullseye>
            <Spinner aria-label="Loading topology" />
          </Bullseye>
        ) : query.isError ? (
          <EmptyState titleText="Topology unavailable" headingLevel="h2" status="warning">
            <EmptyStateBody>The gateway could not return topology. Kubernetes actions remain available.</EmptyStateBody>
          </EmptyState>
        ) : query.data ? (
          <>
            {query.data.discovery.partial ? (
              <Alert variant="warning" isInline title="Partial topology" component="h2">
                Some sources could not be read. Showing available nodes.
              </Alert>
            ) : null}
            <TopologyCanvas graph={query.data} />
          </>
        ) : null}
      </PageSection>
    </>
  );
};
