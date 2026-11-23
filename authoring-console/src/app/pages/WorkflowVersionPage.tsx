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
import {
  Breadcrumb,
  BreadcrumbItem,
  Bullseye,
  Button,
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
  Flex,
  Grid,
  GridItem,
  Stack,
  StackItem,
  MenuToggle,
  PageSection,
  Spinner,
  Tab,
  TabTitleText,
  Tabs,
  Title,
} from "@patternfly/react-core";
import { stringify as stringifyYaml } from "yaml";
import { DiagramPreview } from "../../editors/DiagramPreview.tsx";
import { YamlEditor } from "../../editors/YamlEditor.tsx";
import { VersionHistory, VersionRunPanel } from "../../execution/VersionExecution.tsx";
import { NamespaceBar } from "../shell/NamespaceBar.tsx";
import { useNavigation } from "../ConsoleContext.tsx";
import { useWorkflowCr, useWorkflowFamilies, useWorkflowFlow } from "../queries.ts";
import type { WorkflowVersionKey } from "../../contracts/index.ts";

export const WorkflowVersionPage = (): ReactNode => {
  const { params, navigate } = useNavigation();
  const namespace = decodeURIComponent(params["namespace"] ?? "");
  const workflowName = decodeURIComponent(params["workflowName"] ?? "");
  const version = decodeURIComponent(params["version"] ?? "");
  const versionKey: WorkflowVersionKey = { namespace, workflowName, version };

  const [activeTab, setActiveTab] = useState<string>("details");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [runPanelOpen, setRunPanelOpen] = useState(false);

  const openPublish = (mode: "create" | "update"): void => {
    const params = new URLSearchParams({
      mode,
      namespace,
      workflowName,
      version,
    });
    navigate(`/publish?${params.toString()}`);
  };

  const handleRunWorkflow = (): void => {
    setRunPanelOpen(true);
    setActionsOpen(false);
  };

  const families = useWorkflowFamilies(namespace);
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

  if (families.isError) return (
    <PageSection>
      <EmptyState titleText="Gateway catalog unavailable" headingLevel="h2" status="warning">
        <Button variant="secondary" onClick={() => void families.refetch()}>Retry</Button>
      </EmptyState>
    </PageSection>
  );

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
      <NamespaceBar namespace={namespace} />
      <PageSection isFilled={false}>
        <Stack hasGutter>
          <Breadcrumb>
            <BreadcrumbItem to="#/workflows">Workflows</BreadcrumbItem>
            <BreadcrumbItem>{workflowName}</BreadcrumbItem>
            <BreadcrumbItem isActive>{version}</BreadcrumbItem>
          </Breadcrumb>
          <Flex alignItems={{ default: "alignItemsCenter" }} justifyContent={{ default: "justifyContentSpaceBetween" }}>
            <div>
              <Title headingLevel="h1">
                {workflowName} <Label color="blue">{version}</Label>
              </Title>
            </div>
            <Flex spaceItems={{ default: "spaceItemsSm" }}>
              <Button variant="primary" className="console-primary-action" onClick={handleRunWorkflow}>
                Run this version
              </Button>
              <Dropdown
                isOpen={actionsOpen}
                onOpenChange={setActionsOpen}
                toggle={(toggleRef) => (
                  <MenuToggle
                    ref={toggleRef}
                    onClick={() => setActionsOpen(!actionsOpen)}
                  >
                    Actions
                  </MenuToggle>
                )}
              >
                <DropdownList>
                  <DropdownItem key="create" onClick={() => openPublish("create")}>
                    Publish new version
                  </DropdownItem>
                  <DropdownItem key="update" onClick={() => openPublish("update")}>
                    Update this version
                  </DropdownItem>
                </DropdownList>
              </Dropdown>
            </Flex>
          </Flex>
        </Stack>
      </PageSection>
      <PageSection>
        <Tabs className="console-resource-tabs" activeKey={activeTab} onSelect={(_event, key) => setActiveTab(String(key))}>
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            <Stack hasGutter style={{ paddingBlockStart: "var(--pf-t--global--spacer--lg)" }}>
              <StackItem><Title headingLevel="h2" size="xl">Workflow details</Title></StackItem>
              <Grid hasGutter>
                <GridItem md={6}>
                  <DescriptionList>
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
                  </DescriptionList>
                </GridItem>
                <GridItem md={6}>
                  <DescriptionList>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Runtime</DescriptionListTerm>
                      <DescriptionListDescription>{row.runtimeName || "—"}</DescriptionListDescription>
                    </DescriptionListGroup>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Definition (CR name)</DescriptionListTerm>
                      <DescriptionListDescription data-testid="cr-name">{row.crName ?? "Unresolved"}</DescriptionListDescription>
                    </DescriptionListGroup>
                  </DescriptionList>
                </GridItem>
              </Grid>
            </Stack>
          </Tab>
          <Tab eventKey="diagram" title={<TabTitleText>Diagram</TabTitleText>}>
            {/* React Flow measures its viewport on mount. Inactive tab panels have no dimensions. */}
            {activeTab === "diagram" && <DiagramTab versionKey={versionKey} />}
          </Tab>
          <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
            {row.crName ? <YamlTab resourceName={row.crName} namespace={namespace} /> : <Content component="p">A unique Kubernetes CR could not be resolved for this version.</Content>}
          </Tab>
          <Tab eventKey="history" title={<TabTitleText>Instance history</TabTitleText>}>
            <VersionHistory versionKey={versionKey} />
          </Tab>
        </Tabs>
      </PageSection>
      {runPanelOpen && <VersionRunPanel versionKey={versionKey} onClose={() => setRunPanelOpen(false)} />}
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
  return <YamlEditor value={stringifyYaml(cr.data)} ariaLabel="Full definition CR YAML" foldManagedFields readOnly />;
};
