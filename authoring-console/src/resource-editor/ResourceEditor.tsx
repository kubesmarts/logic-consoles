/**
 * Resource editor component — the public interface for packets D and E.
 *
 * Provides form/YAML dual-mode editing, dry-run, diff, write, and reconciliation
 * observation. Kind-agnostic: handles ClusterLogicPlatform, LogicFlowRuntime,
 * LogicFlowDefinition, and core/v1 Namespace.
 */
import { type ReactNode } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Tabs,
  Tab,
  TabTitleText,
  Alert,
  AlertVariant,
  Button,
  Spinner,
} from "@patternfly/react-core";
import type {
  KubeObject,
  ResourceRef,
  WriteVerb,
  KubernetesTransport,
} from "../contracts/index.ts";
import { YamlEditor } from "../editors/YamlEditor.tsx";
import { useResourceEditor, type UseResourceEditorResult } from "./useResourceEditor.ts";
import type { EditorMode } from "./types.ts";

export interface ResourceEditorProps<TSpec = unknown, TStatus = unknown> {
  /** The transport for Kubernetes operations (injected). */
  readonly transport: KubernetesTransport;
  /** Resource reference. */
  readonly ref: ResourceRef;
  /** Seed from a live object (update path) or a template (create path). */
  readonly seed: KubeObject<TSpec, TStatus>;
  /** The verb (create or update). */
  readonly verb: WriteVerb;
  /** The deployed object for diff/comparison (update path only). */
  readonly deployed?: KubeObject<TSpec, TStatus>;
  /** Form view renderer. Receives the editor controller for field updates. */
  readonly renderForm?: (
    controller: UseResourceEditorResult<TSpec, TStatus>,
  ) => ReactNode;
  /** Optional callback when write succeeds. */
  readonly onWriteSuccess?: (result: KubeObject<TSpec, TStatus>) => void;
  /** Optional callback when dry-run succeeds. */
  readonly onDryRunSuccess?: (admitted: KubeObject<TSpec, TStatus>) => void;
}

export const ResourceEditor = <TSpec = unknown, TStatus = unknown>({
  transport,
  ref,
  seed,
  verb,
  deployed,
  renderForm,
  onWriteSuccess,
  onDryRunSuccess,
}: ResourceEditorProps<TSpec, TStatus>): ReactNode => {
  const controller = useResourceEditor<TSpec, TStatus>({
    transport,
    ref,
    seed,
    verb,
    deployed,
  });

  const { state, setMode, updateYaml, dryRun, submit } = controller;

  const handleTabChange = (_event: unknown, tabIndex: string | number) => {
    setMode(tabIndex as EditorMode);
  };

  const handleDryRun = async () => {
    await dryRun();
    if (state.admitted && onDryRunSuccess) {
      onDryRunSuccess(state.admitted as KubeObject<TSpec, TStatus>);
    }
  };

  const handleSubmit = async () => {
    try {
      const result = await submit();
      if (onWriteSuccess) {
        onWriteSuccess(result);
      }
    } catch {
      // Errors are already in state.errors
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {verb === "create" ? "Create" : "Update"} {ref.gvk.kind}
        </CardTitle>
      </CardHeader>
      <CardBody>
        {state.errors.length > 0 && (
          <Alert
            variant={
              state.errors[0]?.kind === "forbidden"
                ? AlertVariant.warning
                : AlertVariant.danger
            }
            title={
              state.errors[0]?.kind === "admission"
                ? "Admission error"
                : state.errors[0]?.kind === "conflict"
                  ? "Version conflict"
                  : state.errors[0]?.kind === "forbidden"
                    ? "Forbidden"
                    : "Error"
            }
            isInline
          >
            {state.errors[0]?.kind === "admission" &&
              state.errors[0].errors.map((err) => (
                <div key={err.path}>
                  {err.path && <strong>{err.path}:</strong>} {err.message}
                </div>
              ))}
            {state.errors[0]?.kind === "conflict" && (
              <div>
                The resource has been modified. Latest resourceVersion:{" "}
                {state.errors[0].latestResourceVersion}
              </div>
            )}
            {state.errors[0]?.kind === "forbidden" && (
              <div>
                {state.errors[0].reason ||
                  "You do not have permission to perform this operation."}
              </div>
            )}
            {state.errors[0]?.kind === "unreachable" && (
              <div>API server unreachable: {state.errors[0].detail}</div>
            )}
            {state.errors[0]?.kind === "server-error" && (
              <div>Server error: {state.errors[0].detail}</div>
            )}
          </Alert>
        )}

        {state.draft.invalid && (
          <Alert variant={AlertVariant.warning} title="Invalid YAML" isInline>
            The YAML has syntax errors. The last valid preview is shown (stale).
          </Alert>
        )}

        <Tabs activeKey={state.mode} onSelect={handleTabChange}>
          <Tab eventKey="form" title={<TabTitleText>Form</TabTitleText>}>
            {renderForm ? (
              renderForm(controller)
            ) : (
              <Alert variant={AlertVariant.info} title="Form not provided" isInline>
                Use the YAML tab to edit this resource.
              </Alert>
            )}
          </Tab>
          <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
            <YamlEditor
              value={state.yamlText}
              readOnly={false}
              ariaLabel={`Edit ${ref.gvk.kind} YAML`}
              onChange={updateYaml}
              height="600px"
            />
          </Tab>
        </Tabs>

        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
          <Button variant="secondary" onClick={handleDryRun} isDisabled={state.submitting}>
            {state.submitting ? <Spinner size="sm" /> : "Dry Run"}
          </Button>
          <Button variant="primary" onClick={handleSubmit} isDisabled={state.submitting}>
            {state.submitting ? <Spinner size="sm" /> : verb === "create" ? "Create" : "Update"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
};
