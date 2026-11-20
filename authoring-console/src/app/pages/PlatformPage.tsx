/**
 * Platform screen (read stub): the cluster-scoped singleton ClusterLogicPlatform,
 * showing its immutable target namespace. Setup/edit wizard is packet D.
 */
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bullseye,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateBody,
  Label,
  PageSection,
  Spinner,
  Title,
} from "@patternfly/react-core";
import { useConsole } from "../ConsoleContext.tsx";
import {
  LOGIC_GROUP,
  LOGIC_VERSION,
  LogicKinds,
  type ClusterLogicPlatformSpec,
} from "../../contracts/index.ts";

export const PlatformPage = (): ReactNode => {
  const { session, kubernetes } = useConsole();
  const query = useQuery({
    queryKey: [session.sessionId, session.context.contextName, "platform"],
    queryFn: ({ signal }) =>
      kubernetes.get<ClusterLogicPlatformSpec>(
        { gvk: { group: LOGIC_GROUP, version: LOGIC_VERSION, kind: LogicKinds.ClusterLogicPlatform }, name: "cluster-platform" },
        signal,
      ),
  });

  return (
    <>
      <PageSection>
        <Title headingLevel="h1">
          Platform <Label color="purple">Cluster-scoped</Label>
        </Title>
      </PageSection>
      <PageSection>
        {query.isPending ? (
          <Bullseye>
            <Spinner aria-label="Loading platform" />
          </Bullseye>
        ) : query.isError ? (
          <EmptyState titleText="Platform not found" headingLevel="h2">
            <EmptyStateBody>No ClusterLogicPlatform is configured, or it could not be read.</EmptyStateBody>
          </EmptyState>
        ) : query.data ? (
          <DescriptionList isHorizontal>
            <DescriptionListGroup>
              <DescriptionListTerm>Name</DescriptionListTerm>
              <DescriptionListDescription>{query.data.metadata.name}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Target namespace</DescriptionListTerm>
              <DescriptionListDescription>
                {query.data.spec?.targetNamespace}
                <Content component="small"> (immutable)</Content>
              </DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>
        ) : null}
      </PageSection>
    </>
  );
};
