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
import { LOGIC_GROUP } from "../../contracts/index.ts";
import { usePlatform } from "../../setup/usePlatform.ts";
import { PlatformSetupWizard } from "../../setup/index.ts";

export const PlatformPage = (): ReactNode => {
  const { session, capabilities } = useConsole();
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  const query = usePlatform();
  const verb = query.data ? "update" : "create";
  const access = useQuery({
    queryKey: [session.sessionId, "can-write-platform", verb],
    queryFn: ({ signal }) => capabilities.canI({ group: LOGIC_GROUP, verb, resource: "clusterlogicplatforms" }, signal),
    enabled: query.isSuccess,
  });

  if (showSetupWizard) {
    return (
      <PageSection type="wizard" hasBodyWrapper={false}>
        <PlatformSetupWizard
          editMode={Boolean(query.data)}
          onComplete={() => {
            setShowSetupWizard(false);
            query.refetch();
          }}
          onCancel={() => setShowSetupWizard(false)}
        />
      </PageSection>
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
        ) : !query.data ? (
          <EmptyState titleText="No platform configured" headingLevel="h2">
            <EmptyStateBody>Set up a cluster-scoped ClusterLogicPlatform to begin.</EmptyStateBody>
            <Button variant="primary" isDisabled={access.data?.decision !== "allowed"} onClick={() => setShowSetupWizard(true)}>
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
              {access.data?.decision === "allowed" ? (
                <Button variant="secondary" onClick={() => setShowSetupWizard(true)}>Edit platform</Button>
              ) : <Content component="small">Read-only access</Content>}
            </div>
          </>
        )}
      </PageSection>
    </>
  );
};
