/**
 * Platform screen: the cluster-scoped singleton ClusterLogicPlatform,
 * showing its immutable target namespace. Integrates setup wizard (Packet D1).
 */
import type { ReactNode } from "react";
import { useState } from "react";
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
  Button,
} from "@patternfly/react-core";
import { useConsole } from "../ConsoleContext.tsx";
import {
  LOGIC_GROUP,
  LOGIC_VERSION,
  LogicKinds,
  type ClusterLogicPlatformSpec,
} from "../../contracts/index.ts";
import { PlatformSetupWizard } from "../../setup/index.ts";

export const PlatformPage = (): ReactNode => {
  const { session, kubernetes } = useConsole();
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  const query = useQuery({
    queryKey: [session.sessionId, session.context.contextName, "platform"],
    queryFn: ({ signal }) =>
      kubernetes.get<ClusterLogicPlatformSpec>(
        { gvk: { group: LOGIC_GROUP, version: LOGIC_VERSION, kind: LogicKinds.ClusterLogicPlatform }, name: "cluster-platform" },
        signal,
      ).catch((err: unknown) => {
        // Check if it's a 403
        if (err && typeof err === "object" && "statusCode" in err && err.statusCode === 403) {
          return null; // Platform discovery forbidden
        }
        throw err;
      }),
  });

  if (showSetupWizard) {
    return (
      <PlatformSetupWizard
        onComplete={() => {
          setShowSetupWizard(false);
          query.refetch();
        }}
        onCancel={() => setShowSetupWizard(false)}
      />
    );
  }

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
          <EmptyState titleText="Error loading platform" headingLevel="h2">
            <EmptyStateBody>
              {query.error instanceof Error ? query.error.message : "Failed to load platform configuration."}
            </EmptyStateBody>
          </EmptyState>
        ) : query.data === null ? (
          <EmptyState titleText="Platform discovery denied" headingLevel="h2">
            <EmptyStateBody>You don't have permission to read the platform. Available actions may be limited.</EmptyStateBody>
          </EmptyState>
        ) : !query.data ? (
          <EmptyState titleText="No platform configured" headingLevel="h2">
            <EmptyStateBody>Set up a cluster-scoped ClusterLogicPlatform to begin.</EmptyStateBody>
            <Button variant="primary" onClick={() => setShowSetupWizard(true)}>
              Set up platform
            </Button>
          </EmptyState>
        ) : (
          <>
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
            <div style={{ marginTop: "1.5rem" }}>
              <Button variant="secondary">View configuration</Button>
            </div>
          </>
        )}
      </PageSection>
    </>
  );
};
