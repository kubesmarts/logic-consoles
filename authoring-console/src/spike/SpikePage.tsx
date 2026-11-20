/**
 * Gate-zero dependency spike page.
 *
 * Mounts, at once, inside the real PatternFly shell: a Monaco YAML editor, the CNCF
 * `@openworkflowspec/diagram-editor` preview, and a React Flow canvas — all honouring
 * the shell's light/dark theme. The Playwright spec (e2e/spike.spec.ts) loads this
 * page in a real browser and asserts all three render in both themes with working
 * keyboard focus. This is the go/no-go proof the full stack coexists.
 */
import type { ReactNode } from "react";
import { Grid, GridItem, PageSection, Title } from "@patternfly/react-core";
import { stringify as stringifyYaml } from "yaml";
import { DiagramPreview } from "../editors/DiagramPreview.tsx";
import { YamlEditor } from "../editors/YamlEditor.tsx";
import { TopologyCanvas } from "../editors/TopologyCanvas.tsx";
import { helloWorldFlowV1 } from "../fixtures/flows.ts";
import { helloWorldDefinitionV1 } from "../fixtures/kubernetes.ts";
import { topologyFullFixture } from "../fixtures/topology.ts";

const flowYaml = stringifyYaml(helloWorldFlowV1);
const crYaml = stringifyYaml(helloWorldDefinitionV1);

export const SpikePage = (): ReactNode => (
  <PageSection>
    <Title headingLevel="h1">Dependency spike</Title>
    <Grid hasGutter>
      <GridItem span={12} lg={6}>
        <Title headingLevel="h2">Monaco YAML</Title>
        <YamlEditor value={crYaml} ariaLabel="Spike YAML editor" height="360px" />
      </GridItem>
      <GridItem span={12} lg={6}>
        <Title headingLevel="h2">CNCF diagram</Title>
        <DiagramPreview content={flowYaml} ariaLabel="Spike diagram preview" />
      </GridItem>
      <GridItem span={12}>
        <Title headingLevel="h2">React Flow topology</Title>
        <TopologyCanvas graph={topologyFullFixture} />
      </GridItem>
    </Grid>
  </PageSection>
);
