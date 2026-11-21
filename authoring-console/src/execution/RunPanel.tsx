/**
 * Run panel — schema-driven input form + sync/async execution modes.
 *
 * Uses the workflow's input.schema.document to build PatternFly fields for the
 * supported subset. Falls back to raw JSON for external schemas, unsupported
 * dialects, or absent schemas. Executes via the selected version's advertised
 * execute/executeSync link. EXACTLY ONE POST per attempt, no auto-retry.
 */
import { useState, type ReactNode, useCallback } from "react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  Content,
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerContentBody,
  DrawerHead,
  DrawerPanelContent,
  Form,
  FormGroup,
  Label,
  Radio,
  TextArea,
  Title,
} from "@patternfly/react-core";
import type {
  DefinitionResource,
  GatewayTransport,
  WorkflowDocument,
  WorkflowInput,
} from "../contracts/index.ts";
import { SchemaForm } from "./SchemaForm.tsx";
import { getSupportedInputSchema, validateInput, initializeFormData } from "./schema-utils.ts";
import type { RunState, ExecutionMode, ExecutionResult } from "./types.ts";

export interface RunPanelProps {
  readonly definition: DefinitionResource;
  readonly flow: WorkflowDocument;
  readonly gateway: GatewayTransport;
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export const RunPanel = ({ definition, flow, gateway, isOpen, onClose }: RunPanelProps): ReactNode => {
  const schema = getSupportedInputSchema(flow);
  const hasSchemaSupport = schema !== null;

  const [state, setState] = useState<RunState>(() => ({
    inputMode: hasSchemaSupport ? "form" : "json",
    executionMode: "sync",
    formData: schema ? initializeFormData(schema) : {},
    jsonInput: "{}",
    isExecuting: false,
    result: null,
    error: null,
  }));

  const handleExecute = useCallback(async (): Promise<void> => {
    setState((s) => ({ ...s, isExecuting: true, result: null, error: null }));

    try {
      // Build the input payload
      let input: WorkflowInput;
      if (state.inputMode === "form" && schema) {
        // Validate form data
        const errors = validateInput(schema, state.formData);
        if (errors.length > 0) {
          setState((s) => ({ ...s, isExecuting: false, error: errors.join("; ") }));
          return;
        }
        input = state.formData;
      } else {
        // Parse JSON input
        try {
          input = JSON.parse(state.jsonInput);
        } catch {
          setState((s) => ({ ...s, isExecuting: false, error: "Invalid JSON input" }));
          return;
        }
      }

      // Get the appropriate link
      const link =
        state.executionMode === "sync"
          ? definition._links.executeSync
          : definition._links.execute;

      if (!link) {
        setState((s) => ({
          ...s,
          isExecuting: false,
          error: `${state.executionMode === "sync" ? "Synchronous" : "Asynchronous"} execution is unavailable for this version`,
        }));
        return;
      }

      // Execute EXACTLY ONCE with an AbortController
      const controller = new AbortController();
      let result: ExecutionResult;
      if (state.executionMode === "sync") {
        const syncResult = await gateway.executeSync(link, input, controller.signal);
        result = { mode: "sync", output: syncResult.output, raw: syncResult.raw };
      } else {
        const asyncResult = await gateway.execute(link, input, controller.signal);
        result = { mode: "async", instanceId: asyncResult.instanceId, raw: asyncResult.raw };
      }

      setState((s) => ({ ...s, isExecuting: false, result }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Execution failed";
      // A timeout stays UNKNOWN — do not auto-retry
      setState((s) => ({
        ...s,
        isExecuting: false,
        error: message.includes("timeout")
          ? "Request timed out. The workflow may have started. Check instance history."
          : message,
      }));
    }
  }, [state.inputMode, state.formData, state.jsonInput, state.executionMode, schema, definition, gateway]);

  const handleModeChange = (mode: ExecutionMode): void => {
    setState((s) => ({ ...s, executionMode: mode }));
  };

  const handleInputModeChange = (mode: "form" | "json"): void => {
    setState((s) => ({ ...s, inputMode: mode }));
  };

  const handleFormChange = (formData: Record<string, unknown>): void => {
    setState((s) => ({ ...s, formData }));
  };

  const handleJsonChange = (jsonInput: string): void => {
    setState((s) => ({ ...s, jsonInput }));
  };

  const panelContent = (
    <DrawerPanelContent isResizable minSize="400px" defaultSize="600px">
      <DrawerHead>
        <Title headingLevel="h2">Run workflow</Title>
        <DrawerCloseButton onClick={onClose} />
      </DrawerHead>
      <DrawerContentBody>
        <div style={{ padding: "1rem" }}>
          {/* Version identity */}
          <Card isCompact style={{ marginBottom: "1rem" }}>
            <CardBody>
              <Content component="p">
                <strong>Namespace:</strong> {definition.namespace}
              </Content>
              <Content component="p">
                <strong>Workflow:</strong> {definition.name}
              </Content>
              <Content component="p">
                <Label color="blue">{definition.version}</Label>
              </Content>
            </CardBody>
          </Card>

          {/* Input mode selector */}
          {hasSchemaSupport && (
            <Card isCompact style={{ marginBottom: "1rem" }}>
              <CardTitle>Input format</CardTitle>
              <CardBody>
                <Form>
                  <FormGroup role="radiogroup">
                    <Radio
                      id="input-mode-form"
                      name="input-mode"
                      label="Schema-driven form"
                      isChecked={state.inputMode === "form"}
                      onChange={() => handleInputModeChange("form")}
                    />
                    <Radio
                      id="input-mode-json"
                      name="input-mode"
                      label="Raw JSON"
                      isChecked={state.inputMode === "json"}
                      onChange={() => handleInputModeChange("json")}
                    />
                  </FormGroup>
                </Form>
              </CardBody>
            </Card>
          )}

          {/* Input form or JSON editor */}
          <Card isCompact style={{ marginBottom: "1rem" }}>
            <CardTitle>Workflow input</CardTitle>
            <CardBody>
              {state.inputMode === "form" && schema ? (
                <SchemaForm schema={schema} value={state.formData} onChange={handleFormChange} />
              ) : (
                <>
                  {!hasSchemaSupport && (
                    <Alert
                      variant="info"
                      isInline
                      title="Raw JSON input"
                      style={{ marginBottom: "1rem" }}
                    >
                      This workflow has no supported inline input schema. Enter the workflow input
                      as JSON.
                    </Alert>
                  )}
                  <FormGroup label="JSON input" fieldId="json-input">
                    <TextArea
                      id="json-input"
                      value={state.jsonInput}
                      onChange={(_event, value) => handleJsonChange(value)}
                      rows={10}
                      aria-label="JSON input"
                    />
                  </FormGroup>
                </>
              )}
            </CardBody>
          </Card>

          {/* Execution mode selector */}
          <Card isCompact style={{ marginBottom: "1rem" }}>
            <CardTitle>Execution mode</CardTitle>
            <CardBody>
              <Form>
                <FormGroup role="radiogroup">
                  <Radio
                    id="exec-mode-sync"
                    name="exec-mode"
                    label="Run and wait (synchronous)"
                    description="Wait for the workflow to complete and display the output"
                    isChecked={state.executionMode === "sync"}
                    onChange={() => handleModeChange("sync")}
                  />
                  <Radio
                    id="exec-mode-async"
                    name="exec-mode"
                    label="Start in background (asynchronous)"
                    description="Start the workflow and return immediately with an instance ID"
                    isChecked={state.executionMode === "async"}
                    onChange={() => handleModeChange("async")}
                  />
                </FormGroup>
              </Form>
            </CardBody>
          </Card>

          {/* Execute button */}
          <Button
            variant="primary"
            onClick={handleExecute}
            isLoading={state.isExecuting}
            isDisabled={state.isExecuting}
            style={{ marginBottom: "1rem" }}
          >
            {state.executionMode === "sync" ? "Run and wait" : "Start in background"}
          </Button>

          {/* Error display */}
          {state.error && (
            <Alert variant="danger" isInline title="Execution error" style={{ marginTop: "1rem" }}>
              {state.error}
            </Alert>
          )}

          {/* Result display */}
          {state.result && (
            <Card isCompact style={{ marginTop: "1rem" }}>
              <CardTitle>
                {state.result.mode === "sync" ? "Workflow output" : "Instance started"}
              </CardTitle>
              <CardBody>
                {state.result.mode === "sync" ? (
                  <pre style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}>
                    {JSON.stringify(state.result.output, null, 2)}
                  </pre>
                ) : (
                  <>
                    <Content component="p">
                      <strong>Instance ID:</strong> {state.result.instanceId}
                    </Content>
                    <Content component="p" style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
                      The workflow has been started in the background. View instance history to
                      track its progress.
                    </Content>
                  </>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </DrawerContentBody>
    </DrawerPanelContent>
  );

  return (
    <Drawer isExpanded={isOpen} onExpand={() => {}}>
      <DrawerContent panelContent={panelContent}>
        <DrawerContentBody>{/* Main content goes here */}</DrawerContentBody>
      </DrawerContent>
    </Drawer>
  );
};
