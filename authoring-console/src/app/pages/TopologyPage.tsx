/**
 * Topology page: cluster topology graph with keyboard-accessible list,
 * definition selection drawer, and distinct error state handling.
 */
import type { ReactNode } from "react";
import { PageSection, Title } from "@patternfly/react-core";
import { NamespaceBar } from "../shell/NamespaceBar.tsx";
import { TopologyView } from "../../shared/operations/index.ts";
import { useConsole, useNavigation } from "../ConsoleContext.tsx";

export const TopologyPage = (): ReactNode => {
  const { session, gateway } = useConsole();
  const navigation = useNavigation();
  const namespace = session.namespace ?? "default";

  return (
    <>
      <NamespaceBar />
      <PageSection>
        <Title headingLevel="h1">Topology</Title>
      </PageSection>
      <TopologyView namespace={namespace} gateway={gateway} navigation={navigation} />
    </>
  );
};
