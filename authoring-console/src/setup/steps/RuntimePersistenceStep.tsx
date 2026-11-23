import { Checkbox, Content, Form, FormGroup, FormHelperText, HelperText, HelperTextItem, TextInput } from "@patternfly/react-core";
import type { RuntimeDatastore, RuntimePersistence } from "../types.ts";

const emptyStore = (): RuntimeDatastore => ({ postgresql: { secretRef: { name: "" }, serviceRef: { name: "" } } });

function FieldHelp({ id, children }: { id: string; children: string }) {
  return <FormHelperText><HelperText id={id}><HelperTextItem>{children}</HelperTextItem></HelperText></FormHelperText>;
}

function DatastoreFields({ label, store, change }: {
  label: string; store: RuntimeDatastore; change: (store: RuntimeDatastore) => void;
}) {
  const pg = store.postgresql ?? { secretRef: { name: "" }, serviceRef: { name: "" } };
  const tables = label === "Quartz" ? "Quartz scheduler tables" : "workflow state tables";
  const fields = [
    { key: "name", title: "Service name", example: "postgresql", help: "Kubernetes Service that provides the PostgreSQL connection." },
    { key: "namespace", title: "Service namespace", example: "databases", help: "Enter the namespace that hosts the Service. Leave blank to resolve the service name directly." },
    { key: "databaseName", title: "Database name", example: "logicflow", help: `PostgreSQL database that contains the ${tables}.` },
    { key: "databaseSchema", title: "Database schema", example: label.toLowerCase(), help: `Schema for the ${tables}. Leave blank to use the database default.` },
  ] as const;
  return <>
    <FormGroup fieldId={label + "-secret"} label="Operational Secret name" isRequired>
      <TextInput id={label + "-secret"} aria-describedby={label + "-secret-help"} placeholder="e.g. postgresql-secret" required value={pg.secretRef?.name ?? ""} onChange={(_, name) =>
        change({ ...store, postgresql: { ...pg, secretRef: { ...pg.secretRef, name } } })} />
      <FieldHelp id={label + "-secret-help"}>Secret containing the PostgreSQL credentials for reading and writing data. The default keys are POSTGRESQL_USER and POSTGRESQL_PASSWORD.</FieldHelp>
    </FormGroup>
    {fields.map(({ key, title, example, help }) => <FormGroup key={key} fieldId={label + key} label={title} isRequired={key === "name"}>
      <TextInput id={label + key} aria-describedby={label + key + "-help"} placeholder={`e.g. ${example}`} required={key === "name"} value={pg.serviceRef?.[key] ?? ""} onChange={(_, value) =>
        change({ ...store, postgresql: { ...pg, serviceRef: { ...pg.serviceRef, [key]: value || undefined } } })} />
      <FieldHelp id={label + key + "-help"}>{help}</FieldHelp>
    </FormGroup>)}
    <FormGroup fieldId={label + "-migration"} label="Migration Secret name (optional)">
      <TextInput id={label + "-migration"} aria-describedby={label + "-migration-help"} placeholder="e.g. postgresql-migration-secret" value={store.migrationSecretRef?.name ?? ""} onChange={(_, name) =>
        change({ ...store, migrationSecretRef: name ? { ...store.migrationSecretRef, name } : undefined })} />
      <FieldHelp id={label + "-migration-help"}>Secret with credentials for schema migrations. Leave blank to reuse the operational Secret.</FieldHelp>
    </FormGroup>
  </>;
}

export function RuntimePersistenceStep({ value, change }: {
  value?: RuntimePersistence | null; change: (value: RuntimePersistence | null) => void;
}) {
  return <Form>
    <div>
      <Content component="h3" style={{ marginBottom: "1rem" }}>Runtime PostgreSQL datastore</Content>
      <FormGroup fieldId="runtime-db">
        <Checkbox id="runtime-db" aria-describedby="runtime-db-help" label="Configure runtime persistence" isChecked={!!value}
          onChange={(_, enabled) => change(enabled ? { runtime: emptyStore() } : null)} />
        <FieldHelp id="runtime-db-help">Configure PostgreSQL storage for workflow state. Runtimes use this datastore when PlatformDB is selected.</FieldHelp>
      </FormGroup>
    </div>
    {value && <>
      <DatastoreFields label="Runtime" store={value.runtime ?? {}} change={runtime => change({ ...value, runtime })} />
      <div>
        <Content component="h3" style={{ marginBottom: "1rem" }}>Quartz PostgreSQL datastore</Content>
        <FormGroup fieldId="quartz-db">
          <Checkbox id="quartz-db" label="Use a separate Quartz datastore" aria-describedby="quartz-db-help"
            isChecked={!!value.quartz?.postgresql} onChange={(_, enabled) => change({ ...value, quartz: enabled ? emptyStore() : undefined })} />
          <FieldHelp id="quartz-db-help">Configure a separate PostgreSQL connection for scheduler tables. Leave unchecked to use the runtime datasource.</FieldHelp>
        </FormGroup>
      </div>
      {value.quartz?.postgresql && <DatastoreFields label="Quartz" store={value.quartz} change={quartz => change({ ...value, quartz })} />}
    </>}
  </Form>;
}
