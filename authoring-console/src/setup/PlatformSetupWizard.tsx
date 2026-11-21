/**
 * Platform setup wizard — Packet D1 deliverable.
 * Guides an admin from "no platform" to a submitted, reconciling ClusterLogicPlatform.
 *
 * Steps:
 * 1. Target namespace (select existing or create new)
 * 2. Execution mode (quick-run vs history-enabled)
 * 3. Data Index configuration (history path only)
 * 4. Vector configuration (history path only)
 * 5. Gateway endpoint
 * 6. Review + dry-run + submit
 */
import { type ReactNode, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wizard, WizardStep, EmptyState, EmptyStateBody, Bullseye, Spinner } from "@patternfly/react-core";
import { useConsole } from "../app/ConsoleContext.tsx";
import { LOGIC_GROUP, LOGIC_VERSION, LogicKinds, type ClusterLogicPlatformSpec } from "../contracts/index.ts";
import type { PlatformSetupDraft } from "./types.ts";
import { TargetNamespaceStep } from "./steps/TargetNamespaceStep.tsx";
import { ExecutionModeStep } from "./steps/ExecutionModeStep.tsx";
import { DataIndexStep } from "./steps/DataIndexStep.tsx";
import { VectorStep } from "./steps/VectorStep.tsx";
import { GatewayStep } from "./steps/GatewayStep.tsx";
import { ReviewStep } from "./steps/ReviewStep.tsx";

interface PlatformSetupWizardProps {
  readonly onComplete?: () => void;
  readonly onCancel?: () => void;
}

export const PlatformSetupWizard = ({ onComplete, onCancel }: PlatformSetupWizardProps): ReactNode => {
  const { session, kubernetes, capabilities } = useConsole();

  // Discover existing platform
  const discoveryQuery = useQuery({
    queryKey: [session.sessionId, session.context.contextName, "platform-discovery"],
    queryFn: ({ signal }) =>
      kubernetes.get<ClusterLogicPlatformSpec>(
        { gvk: { group: LOGIC_GROUP, version: LOGIC_VERSION, kind: LogicKinds.ClusterLogicPlatform }, name: "cluster-platform" },
        signal,
      ).catch((err: unknown) => {
        // Check if it's a 403
        if (err && typeof err === "object" && "statusCode" in err && err.statusCode === 403) {
          return null; // Platform discovery forbidden
        }
        throw err;
      }),
  });

  // Check capabilities
  const canReadPlatform = discoveryQuery.data !== undefined;
  const canEditPlatformQuery = useQuery({
    queryKey: [session.sessionId, "can-edit-platform"],
    queryFn: ({ signal }) =>
      capabilities.canI(
        {
          group: LOGIC_GROUP,
          resource: "clusterlogicplatforms",
          verb: "update",
        },
        signal,
      ),
    enabled: canReadPlatform && discoveryQuery.data !== null,
  });

  const canCreateNamespaceQuery = useQuery({
    queryKey: [session.sessionId, "can-create-namespace"],
    queryFn: ({ signal }) =>
      capabilities.canI(
        {
          group: "",
          resource: "namespaces",
          verb: "create",
        },
        signal,
      ),
  });

  // Wizard state
  const [draft, setDraft] = useState<PlatformSetupDraft>({
    targetNamespace: "",
    executionMode: "history-enabled",
    gatewayIngress: {
      enabled: true,
    },
  });

  const [currentStep, setCurrentStep] = useState(0);

  const handleDraftUpdate = useCallback((updates: Partial<PlatformSetupDraft>): void => {
    setDraft((prev) => ({ ...prev, ...updates }));
  }, []);

  // Loading state
  if (discoveryQuery.isPending || canEditPlatformQuery.isPending || canCreateNamespaceQuery.isPending) {
    return (
      <Bullseye>
        <Spinner aria-label="Loading platform setup" />
      </Bullseye>
    );
  }

  // Error handling
  if (discoveryQuery.isError) {
    return (
      <EmptyState titleText="Error discovering platform" headingLevel="h1">
        <EmptyStateBody>
          {discoveryQuery.error instanceof Error ? discoveryQuery.error.message : "Failed to discover platform configuration"}
        </EmptyStateBody>
      </EmptyState>
    );
  }

  // Platform discovery states
  const platformExists = discoveryQuery.data !== null && discoveryQuery.data !== undefined;
  const platformCanEdit = canEditPlatformQuery.data?.decision === "allowed";
  const canCreateNamespace = canCreateNamespaceQuery.data?.decision === "allowed";

  // If platform exists and is editable, show view/edit options (TODO: implement edit path)
  // If platform exists and is read-only, show continue option (TODO: implement)
  // If platform discovery is forbidden, show 403 state with available options
  // If platform is absent, show setup wizard

  if (platformExists && platformCanEdit) {
    return (
      <EmptyState titleText="Platform already configured" headingLevel="h1">
        <EmptyStateBody>A ClusterLogicPlatform is already deployed. Edit functionality is coming soon.</EmptyStateBody>
      </EmptyState>
    );
  }

  if (platformExists && !platformCanEdit) {
    return (
      <EmptyState titleText="Platform configured (read-only)" headingLevel="h1">
        <EmptyStateBody>You can view the platform but cannot edit it. Continue to workflows.</EmptyStateBody>
      </EmptyState>
    );
  }

  // Setup wizard for absent or discovery-forbidden platform
  const steps = [
    <WizardStep name="Target namespace" id="target-namespace" key="target-namespace">
      <TargetNamespaceStep draft={draft} onUpdate={handleDraftUpdate} canCreateNamespace={canCreateNamespace} />
    </WizardStep>,
    <WizardStep name="Execution mode" id="execution-mode" key="execution-mode">
      <ExecutionModeStep draft={draft} onUpdate={handleDraftUpdate} />
    </WizardStep>,
    ...(draft.executionMode === "history-enabled"
      ? [
          <WizardStep name="Data Index" id="data-index" key="data-index">
            <DataIndexStep draft={draft} onUpdate={handleDraftUpdate} />
          </WizardStep>,
          <WizardStep name="Vector" id="vector" key="vector">
            <VectorStep draft={draft} onUpdate={handleDraftUpdate} />
          </WizardStep>,
        ]
      : []),
    <WizardStep name="Gateway" id="gateway" key="gateway">
      <GatewayStep draft={draft} onUpdate={handleDraftUpdate} />
    </WizardStep>,
    <WizardStep name="Review" id="review" key="review">
      <ReviewStep draft={draft} onComplete={onComplete} onCancel={onCancel} />
    </WizardStep>,
  ];

  return (
    <Wizard
      title="Set up platform"
      steps={steps as any}
      startAtStep={currentStep}
      onStepChange={((_event: unknown, newStep: any) => {
        setCurrentStep(newStep.index ?? currentStep);
      }) as any}
      onClose={onCancel}
    />
  );
};
