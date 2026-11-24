import { useQuery } from "@tanstack/react-query";
import { observeImages, observedVersion } from "../../compatibility/observations.ts";
/**
 * Compatibility screen: the dev-baseline manifest with tested/detected/source
 * provenance. Shows that no row is certified yet. Drift review and detection logic
 * are packet H; this renders the manifest type from Packet A.
 */
import type { ReactNode } from "react";
import {
  Alert,
  Spinner,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  PageSection,
  Title,
} from "@patternfly/react-core";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
import { useConsole } from "../ConsoleContext.tsx";

export const CompatibilityPage = (): ReactNode => {
  const { compatibility, kubernetes, session } = useConsole();
  const images = useQuery({
    queryKey: [session.sessionId, session.context.contextName, "compatibility-images"],
    queryFn: ({ signal }) => observeImages(kubernetes, signal),
  });
  return (
    <>
      <PageSection>
        <Title headingLevel="h1">Compatibility</Title>
        <DescriptionList isHorizontal>
          <DescriptionListGroup>
            <DescriptionListTerm>Console version</DescriptionListTerm>
            <DescriptionListDescription>{compatibility.consoleVersion}</DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Operator release</DescriptionListTerm>
            <DescriptionListDescription>{compatibility.operatorRelease}</DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>API group/version</DescriptionListTerm>
            <DescriptionListDescription>{compatibility.apiGroupVersion}</DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>
      </PageSection>
      <PageSection>
        {compatibility.certified ? null : (
          <Alert variant="info" isInline title="No certified row" component="h2">
            These are development inputs. No console compatibility row has been certified.
          </Alert>
        )}
        {images.isPending && <Spinner aria-label="Reading cluster images" />}
        <Table aria-label="Compatibility matrix" variant="compact">
          <Thead>
            <Tr>
              <Th>Component</Th>
              <Th>Development baseline</Th>
              <Th>Certified version</Th>
              <Th>Observed image or version</Th>
              <Th>Source</Th>
            </Tr>
          </Thead>
          <Tbody>
            {compatibility.entries.map((entry) => (
              <Tr key={entry.component}>
                <Td dataLabel="Component">{entry.label}</Td>
                <Td dataLabel="Development baseline">{entry.baseline ?? "—"}</Td>
                <Td dataLabel="Certified version">{entry.testedVersion ?? "—"}</Td>
                <Td dataLabel="Observed image or version" style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{observedVersion(entry, images.data?.get(entry.component))}</Td>
                <Td dataLabel="Source">{entry.notes ?? entry.source}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </PageSection>
    </>
  );
};
