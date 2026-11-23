/**
 * Instance lifecycle controls — Suspend, Resume, Cancel.
 *
 * Uses the selected version's advertised lifecycle links (templated by instance ID).
 * Each action targets the SAME instance. The runner enforces state transitions.
 * Cancel requires confirmation. Surfaces the InstanceActionResult including stale-state rejects.
 */
import { useState, type ReactNode } from "react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  Content,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
} from "@patternfly/react-core";
import type { DefinitionResource, GatewayTransport } from "../contracts/index.ts";
import { operationLink, unknownOutcome } from "./operation-link.ts";
import type { InstanceAction, LifecycleState } from "./types.ts";

export interface InstanceLifecycleProps {
  readonly definition: DefinitionResource;
  readonly instanceId: string;
  readonly gateway: GatewayTransport;
  readonly onActionComplete?: () => void;
}

export const InstanceLifecycle = ({
  definition,
  instanceId,
  gateway,
  onActionComplete,
}: InstanceLifecycleProps): ReactNode => {
  const [state, setState] = useState<LifecycleState>({
    instanceId,
    isActing: false,
    actingOn: null,
    result: null,
    error: null,
  });

  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const handleAction = async (action: InstanceAction): Promise<void> => {
    // Cancel requires confirmation
    if (action === "cancel") {
      setCancelModalOpen(true);
      return;
    }

    await executeAction(action);
  };

  const executeAction = async (action: InstanceAction): Promise<void> => {
    setState((s) => ({ ...s, isActing: true, actingOn: action, result: null, error: null }));

    try {
      const link = operationLink(definition, action);

      if (!link) {
        setState((s) => ({
          ...s,
          isActing: false,
          error: `${action} operation is not available for this version`,
        }));
        return;
      }

      // Execute the lifecycle action with an AbortController
      const signal = AbortSignal.timeout(120_000);
      let result;
      if (action === "suspend") {
        result = await gateway.suspendInstance(link, instanceId, signal);
      } else if (action === "resume") {
        result = await gateway.resumeInstance(link, instanceId, signal);
      } else {
        result = await gateway.cancelInstance(link, instanceId, signal);
      }

      setState((s) => ({
        ...s,
        isActing: false,
        actingOn: null,
        result: { action, httpStatus: result.httpStatus, raw: result.raw },
      }));

      // Notify caller to refresh instance details
      if (onActionComplete) {
        onActionComplete();
      }
    } catch (err) {
      const message = unknownOutcome(err) ? "The outcome is unknown. Refresh instance details before acting again." : err instanceof Error ? err.message : `${action} failed`;
      setState((s) => ({ ...s, isActing: false, actingOn: null, error: message }));
    }
  };

  const handleCancelConfirm = async (): Promise<void> => {
    setCancelModalOpen(false);
    await executeAction("cancel");
  };

  const handleCancelDismiss = (): void => {
    setCancelModalOpen(false);
  };

  // Determine available actions based on instance state (simplified - in a real app you'd check instance status)
  const suspendAvailable = !!operationLink(definition, "suspend");
  const resumeAvailable = !!operationLink(definition, "resume");
  const cancelAvailable = !!operationLink(definition, "cancel");

  return (
    <>
      <Card isCompact>
        <CardTitle>Instance actions</CardTitle>
        <CardBody>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {suspendAvailable && (
              <Button
                variant="secondary"
                onClick={() => handleAction("suspend")}
                isDisabled={state.isActing}
                isLoading={state.actingOn === "suspend"}
              >
                Suspend
              </Button>
            )}
            {resumeAvailable && (
              <Button
                variant="secondary"
                onClick={() => handleAction("resume")}
                isDisabled={state.isActing}
                isLoading={state.actingOn === "resume"}
              >
                Resume
              </Button>
            )}
            {cancelAvailable && (
              <Button
                variant="danger"
                onClick={() => handleAction("cancel")}
                isDisabled={state.isActing}
                isLoading={state.actingOn === "cancel"}
              >
                Cancel instance
              </Button>
            )}
          </div>

          {/* Error display */}
          {state.error && (
            <Alert variant="danger" isInline title="Action error" style={{ marginTop: "1rem" }}>
              {state.error}
            </Alert>
          )}

          {/* Result display */}
          {state.result && (
            <Alert
              variant={state.result.httpStatus >= 200 && state.result.httpStatus < 300 ? "success" : "warning"}
              isInline
              title={`${state.result.action} result`}
              style={{ marginTop: "1rem" }}
            >
              <Content component="p">HTTP {state.result.httpStatus}</Content>
              {state.result.httpStatus === 409 && (
                <Content component="p">
                  The instance state has changed. This action is no longer valid for the current state.
                </Content>
              )}
              {state.result.httpStatus >= 200 && state.result.httpStatus < 300 && (
                <Content component="p">
                  Action completed successfully. Refresh instance details to see the updated state.
                </Content>
              )}
            </Alert>
          )}
        </CardBody>
      </Card>

      {/* Cancel confirmation modal */}
      <Modal
        variant={ModalVariant.small}
        isOpen={cancelModalOpen}
        onClose={handleCancelDismiss}
        aria-labelledby="cancel-modal-title"
        aria-describedby="cancel-modal-description"
      >
        <ModalHeader title="Confirm cancellation" labelId="cancel-modal-title" />
        <ModalBody id="cancel-modal-description">
          <Content component="p">
            Are you sure you want to cancel this instance?
          </Content>
          <Content component="p" style={{ marginTop: "1rem" }}>
            <strong>Namespace:</strong> {definition.namespace}
          </Content>
          <Content component="p">
            <strong>Workflow:</strong> {definition.name} ({definition.version})
          </Content>
          <Content component="p">
            <strong>Instance ID:</strong> {instanceId}
          </Content>
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={handleCancelConfirm}>
            Cancel instance
          </Button>
          <Button variant="link" onClick={handleCancelDismiss}>
            Dismiss
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};
