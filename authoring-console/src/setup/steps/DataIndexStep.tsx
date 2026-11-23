/**
 * Data Index configuration step (Deliverable 4).
 * Collects PostgreSQL Secret name, Service name/namespace, database and schema as REFERENCES only.
 */
import { type ReactNode } from "react";
import {
  Form,
  FormGroup,
  TextInput,
  Alert,
  Content,
  AlertVariant,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from "@patternfly/react-core";
import type { PlatformSetupDraft, DataIndexConfig } from "../types.ts";

interface DataIndexStepProps {
  readonly draft: PlatformSetupDraft;
  readonly onUpdate: (updates: Partial<PlatformSetupDraft>) => void;
}

export const DataIndexStep = ({ draft, onUpdate }: DataIndexStepProps): ReactNode => {
  const dataIndex = draft.dataIndex || {
    postgresqlSecretName: "",
    postgresqlServiceName: "",
    postgresqlServiceNamespace: "",
    databaseName: "logicflow",
    databaseSchema: "data_index",
  };

  const handleUpdate = (updates: Partial<DataIndexConfig>): void => {
    onUpdate({
      dataIndex: { ...dataIndex, ...updates },
    });
  };

  return (
    <Form style={{ maxWidth: "600px" }}>
      <Alert
        isInline
        variant={AlertVariant.info}
        title="Data Index requires PostgreSQL"
      >
        This form collects references to an existing PostgreSQL deployment. For a development cluster, see the <a href="https://github.com/kubesmarts/logic-operator/blob/b9a71660267f0cad794b95e010569b280a932da8/config/samples/persistence/postgresql.yaml">operator’s PostgreSQL sample</a>.
      </Alert>

      <div style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
        <Content component="h3" style={{ marginBottom: "1rem" }}>
          PostgreSQL credentials
        </Content>
        <FormGroup label="PostgreSQL Secret name" isRequired fieldId="pg-secret">
          <TextInput
            value={dataIndex.postgresqlSecretName}
            onChange={(_event, value) => handleUpdate({ postgresqlSecretName: value })}
            placeholder="e.g. postgresql-secret"
            id="pg-secret"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Secret containing POSTGRESQL_USER and POSTGRESQL_PASSWORD keys</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <Content component="h3" style={{ marginBottom: "1rem" }}>
          PostgreSQL service
        </Content>
        <FormGroup label="Service name" isRequired fieldId="pg-service">
          <TextInput
            value={dataIndex.postgresqlServiceName}
            onChange={(_event, value) => handleUpdate({ postgresqlServiceName: value })}
            placeholder="e.g. postgresql"
            id="pg-service"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Kubernetes Service hosting PostgreSQL</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        <FormGroup label="Service namespace" fieldId="pg-ns">
          <TextInput
            value={dataIndex.postgresqlServiceNamespace || ""}
            onChange={(_event, value) => handleUpdate({ postgresqlServiceNamespace: value })}
            placeholder="e.g. databases"
            id="pg-ns"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Leave blank for same namespace as platform</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <Content component="h3" style={{ marginBottom: "1rem" }}>
          Database
        </Content>
        <FormGroup label="Database name" isRequired fieldId="pg-db">
          <TextInput
            value={dataIndex.databaseName || ""}
            onChange={(_event, value) => handleUpdate({ databaseName: value })}
            placeholder="e.g. logicflow"
            id="pg-db"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>PostgreSQL database name</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        <FormGroup label="Database schema" isRequired fieldId="pg-schema">
          <TextInput
            value={dataIndex.databaseSchema || ""}
            onChange={(_event, value) => handleUpdate({ databaseSchema: value })}
            placeholder="e.g. data_index"
            id="pg-schema"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Data Index schema name</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </div>

      <div style={{ marginTop: "1.5rem", padding: "1rem", backgroundColor: "#f5f5f5", borderRadius: "4px" }}>
        <Content component="h3" style={{ marginBottom: "0.5rem" }}>
          PostgreSQL setup guide
        </Content>
        <Content component="p">
          Deploy PostgreSQL with the required schema. See the operator's PostgreSQL example at{" "}
          <a href="https://github.com/kubesmarts/logic-operator/blob/b9a71660267f0cad794b95e010569b280a932da8/config/samples/persistence/postgresql.yaml">
            config/samples/persistence/postgresql.yaml
          </a>{" "}
          for the required Secret keys and schema setup.
        </Content>
      </div>
    </Form>
  );
};
