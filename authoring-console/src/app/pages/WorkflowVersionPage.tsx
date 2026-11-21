/**
 * Workflow version detail (M1 reference screen).
 *
 * Tabs: Details, Diagram, YAML, Instance history. Details shows the Kubernetes CR
 * name distinct from the workflow identity (so a user can locate it with kubectl).
 * Diagram mounts the CNCF editor on the version's portable `spec.flow`; YAML mounts
 * Monaco on the FULL CR read from Kubernetes. Selecting a version here is what
 * establishes the target for Diagram, Run and Instance history.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Breadcrumb,
  BreadcrumbItem,
  Bullseye,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Dropdown,
  DropdownItem,
  DropdownList,
  EmptyState,
  EmptyStateBody,
  Label,
  MenuToggle,
  PageSection,
  Spinner,
  Tab,
  TabTitleText,
  Tabs,
  Title,
} from "@patternfly/react-core";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
import { stringify as stringifyYaml } from "yaml";
import { DiagramPreview } from "../../editors/DiagramPreview.tsx";
import { YamlEditor } from "../../editors/YamlEditor.tsx";
import { useConsole, useNavigation } from "../ConsoleContext.tsx";
import { useWorkflowCr, useWorkflowFamilies, useWorkflowFlow } from "../queries.ts";
import type { WorkflowVersionKey } from "../../contracts/index.ts";
import { workflowVersionKeyToString } from "../../contracts/index.ts";

export const WorkflowVersionPage = (): ReactNode => {
  const { params, navigate } = useNavigation();
  const namespace = decodeURIComponent(params["namespace"] ?? "");
  const workflowName = decodeURIComponent(params["workflowName"] ?? "");
  const version = decodeURIComponent(params["version"] ?? "");
  const versionKey: WorkflowVersionKey = { namespace, workflowName, version };

  const [activeTab, setActiveTab] = useState<string>("details");
  const [actionsOpen, setActionsOpen] = useState(false);

  const handleUpdateVersion = (): void => {
    const params = new URLSearchParams({
      mode: "update",
      namespace,
      workflowName,
      version,
    });
    navigate(`/publish?${params.toString()}`);
  };

  const families = useWorkflowFamilies();
  const row = useMemo(
    () =>
      families.data
        ?.find((f) => f.key.namespace === namespace && f.key.workflowName === workflowName)
        ?.versions.find((v) => v.version.version === version),
    [families.data, namespace, workflowName, version],
  );

  if (families.isPending) {
    return (
      <PageSection>
        <Bullseye>
          <Spinner aria-label="Loading version" />
        </Bullseye>
      </PageSection>
    );
  }

  if (!row) {
    return (
      <PageSection>
        <EmptyState titleText="Version not found" headingLevel="h2" status="warning">
          <EmptyStateBody>
            No deployed version {version} of {workflowName} in {namespace}.
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  return (
    <>
      <PageSection>
        <Breadcrumb>
          <BreadcrumbItem to="#/workflows">Workflows</BreadcrumbItem>
          <BreadcrumbItem>{workflowName}</BreadcrumbItem>
          <BreadcrumbItem isActive>{version}</BreadcrumbItem>
        </Breadcrumb>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <Title headingLevel="h1">
              {workflowName} <Label color="blue">{version}</Label>
            </Title>
            <Content component="p">Runtime {row.runtimeName || "—"}</Content>
          </div>
          <Dropdown
            isOpen={actionsOpen}
            onOpenChange={setActionsOpen}
            toggle={(toggleRef) => (
              <MenuToggle
                ref={toggleRef}
                onClick={() => setActionsOpen(!actionsOpen)}
                variant="primary"
              >
                Actions
              </MenuToggle>
            )}
          >
            <DropdownList>
              <DropdownItem key="update" onClick={handleUpdateVersion}>
                Update this version
              </DropdownItem>
            </DropdownList>
          </Dropdown>
        </div>
      </PageSection>
      <PageSection>
        <Tabs activeKey={activeTab} onSelect={(_event, key) => setActiveTab(String(key))}>
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            <DescriptionList isHorizontal>
              <DescriptionListGroup>
                <DescriptionListTerm>Workflow name</DescriptionListTerm>
                <DescriptionListDescription>{workflowName}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Version</DescriptionListTerm>
                <DescriptionListDescription>{version}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Namespace</DescriptionListTerm>
                <DescriptionListDescription>{namespace}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Runtime</DescriptionListTerm>
                <DescriptionListDescription>{row.runtimeName || "—"}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Definition (CR name)</DescriptionListTerm>
                <DescriptionListDescription data-testid="cr-name">{row.crName}</DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </Tab>
          <Tab eventKey="diagram" title={<TabTitleText>Diagram</TabTitleText>}>
            <DiagramTab versionKey={versionKey} />
          </Tab>
          <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
            <YamlTab resourceName={row.crName} namespace={namespace} />
          </Tab>
          <Tab eventKey="history" title={<TabTitleText>Instance history</TabTitleText>}>
            <InstanceHistoryTab versionKey={versionKey} />
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
};

const DiagramTab = ({ versionKey }: { readonly versionKey: WorkflowVersionKey }): ReactNode => {
  const flow = useWorkflowFlow(versionKey);
  if (flow.isPending) return <Spinner aria-label="Loading diagram" />;
  if (flow.isError || !flow.data) return <Content component="p">Diagram unavailable.</Content>;
  return <DiagramPreview content={stringifyYaml(flow.data)} ariaLabel={`Diagram for ${versionKey.workflowName} ${versionKey.version}`} />;
};

const YamlTab = ({
  resourceName,
  namespace,
}: {
  readonly resourceName: string;
  readonly namespace: string;
}): ReactNode => {
  const cr = useWorkflowCr({
    gvk: { group: "logic.kubesmarts.org", version: "v1", kind: "LogicFlowDefinition" },
    name: resourceName,
    namespace,
  });
  if (cr.isPending) return <Spinner aria-label="Loading YAML" />;
  if (cr.isError || !cr.data) return <Content component="p">CR unavailable.</Content>;
  return <YamlEditor value={stringifyYaml(cr.data)} ariaLabel="Full definition CR YAML" readOnly />;
};

const InstanceHistoryTab = ({ versionKey }: { readonly versionKey: WorkflowVersionKey }): ReactNode => {
  const { session, gateway } = useConsole();
  const query = useQuery({
    queryKey: [session.sessionId, "instances", workflowVersionKeyToString(versionKey)],
    queryFn: ({ signal }) =>
      gateway.listInstances(
        { namespace: versionKey.namespace, name: versionKey.workflowName, version: versionKey.version },
        signal,
      ),
  });

  if (query.isPending) return <Spinner aria-label="Loading instance history" />;
  if (query.isError) {
    return (
      <EmptyState titleText="History unavailable" headingLevel="h2" status="warning">
        <EmptyStateBody>The gateway could not return instance history.</EmptyStateBody>
      </EmptyState>
    );
  }
  if (!query.data || query.data.length === 0) {
    return (
      <EmptyState titleText="No instances" headingLevel="h2">
        <EmptyStateBody>No executions have been indexed for this version.</EmptyStateBody>
      </EmptyState>
    );
  }
  return (
    <Table aria-label="Instance history" variant="compact">
      <Thead>
        <Tr>
          <Th>ID</Th>
          <Th>Status</Th>
          <Th>Started</Th>
          <Th>Ended</Th>
        </Tr>
      </Thead>
      <Tbody>
        {query.data.map((instance) => (
          <Tr key={instance.id}>
            <Td dataLabel="ID">{instance.id}</Td>
            <Td dataLabel="Status">{instance.status}</Td>
            <Td dataLabel="Started">{instance.startedAt ?? "—"}</Td>
            <Td dataLabel="Ended">{instance.endedAt ?? "—"}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};
