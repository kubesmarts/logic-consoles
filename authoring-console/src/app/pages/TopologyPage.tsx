/**
 * Topology page: cluster topology graph with keyboard-accessible list,
 * definition selection drawer, and distinct error state handling.
 */
import type { ReactNode } from "react";
import { PageSection, Title } from "@patternfly/react-core";
import { usePlatform } from "../../setup/usePlatform.ts";
import { NamespaceBar } from "../shell/NamespaceBar.tsx";
import { TopologyView } from "../../shared/operations/index.ts";
import { RunActionSlot } from "../../execution/index.ts";
import { useConsole, useNavigation } from "../ConsoleContext.tsx";

function PlatformDatastores({ name }: { name: string }) {
  const platform = usePlatform();
  if (platform.data?.metadata.name !== name) return null;
  const persistence = platform.data.spec?.runtime?.persistence;
  const runtime = persistence?.runtime?.postgresql;
  if (!runtime) return null;
  const quartz = persistence?.quartz?.postgresql;
  return <section aria-label="Platform runtime persistence">
    <Title headingLevel="h3">Runtime persistence</Title>
    <p>Platform: {name} · Target namespace: {platform.data.spec?.targetNamespace}</p>
    <p>Runtime schema: {runtime.serviceRef?.databaseSchema || "Database default"}</p>
    <p>Quartz schema: {quartz ? quartz.serviceRef?.databaseSchema || "Database default" : "Shared with runtime"}</p>
  </section>;
}

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
      <TopologyView
        namespace={namespace}
        gateway={gateway}
        navigation={navigation}
        renderPlatformSummary={node => <PlatformDatastores key={node.id} name={node.name} />}
        renderRunAction={(node) => <RunActionSlot node={node} gateway={gateway} />}
      />
    </>
  );
};
