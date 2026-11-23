import { RuntimePersistenceStep } from "./steps/RuntimePersistenceStep.tsx";
import { usePlatform } from "./usePlatform.ts";
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
import { Wizard, WizardStep, EmptyState, EmptyStateBody, Bullseye, Spinner, Button } from "@patternfly/react-core";
import { useConsole } from "../app/ConsoleContext.tsx";
import { LOGIC_GROUP, type ClusterLogicPlatformSpec, type KubeObject } from "../contracts/index.ts";
import type { ClusterLogicPlatformCRSpec, ClusterLogicPlatformCRStatus } from "./buildPlatformCR.ts";
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
  readonly editMode?: boolean;
}

export const PlatformSetupWizard = ({ onComplete, onCancel, editMode = false }: PlatformSetupWizardProps): ReactNode => {
  const { session, capabilities } = useConsole();

  const discoveryQuery = usePlatform();

  // Check capabilities
  const verb = discoveryQuery.data ? "update" : "create";
  const canEditPlatformQuery = useQuery({
    queryKey: [session.sessionId, "can-write-platform", verb],
    queryFn: ({ signal }) =>
      capabilities.canI(
        {
          group: LOGIC_GROUP,
          resource: "clusterlogicplatforms",
          verb,
        },
        signal,
      ),
    enabled: discoveryQuery.isSuccess,
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

  // Loading state
  if (discoveryQuery.isPending || (discoveryQuery.isSuccess && canEditPlatformQuery.isPending) || canCreateNamespaceQuery.isPending) {
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
  const existingPlatform = platformExists
    ? (discoveryQuery.data as unknown as KubeObject<ClusterLogicPlatformCRSpec, ClusterLogicPlatformCRStatus>)
    : null;

  // If platform exists and is editable but not in edit mode, show option to edit
  if (platformExists && platformCanEdit && !editMode) {
    return (
      <EmptyState titleText="Platform already configured" headingLevel="h1">
        <EmptyStateBody>
          <p>A ClusterLogicPlatform is already deployed.</p>
          <p style={{ marginTop: "1rem" }}>
            <strong>Target namespace:</strong> {(existingPlatform?.spec as ClusterLogicPlatformSpec)?.targetNamespace}
          </p>
        </EmptyStateBody>
        <Button variant="primary" onClick={onCancel}>
          View platform
        </Button>
      </EmptyState>
    );
  }

  // If platform exists and is read-only, show continue option
  if (platformExists && !platformCanEdit) {
    return (
      <EmptyState titleText="Platform configured (read-only)" headingLevel="h1">
        <EmptyStateBody>You can view the platform but cannot edit it. Continue to workflows.</EmptyStateBody>
        <Button variant="primary" onClick={onComplete}>
          Continue to workflows
        </Button>
      </EmptyState>
    );
  }

  if (!platformCanEdit) {
    return <EmptyState titleText="Platform creation unavailable" headingLevel="h2"><EmptyStateBody>Check your permission to create ClusterLogicPlatform resources.</EmptyStateBody></EmptyState>;
  }
  return <PlatformForm {...{ existingPlatform, canCreateNamespace, editMode, onComplete, onCancel }} />;
};

function PlatformForm({ existingPlatform, canCreateNamespace, editMode, onComplete, onCancel }: PlatformSetupWizardProps & {
  existingPlatform: KubeObject<ClusterLogicPlatformCRSpec, ClusterLogicPlatformCRStatus> | null;
  canCreateNamespace: boolean;
}): ReactNode {
  // Initialize draft from existing platform in edit mode
  const initializeDraft = (): PlatformSetupDraft => {
    if (editMode && existingPlatform && existingPlatform.spec) {
      const spec = existingPlatform.spec as ClusterLogicPlatformCRSpec;
      return {
        runtimePersistence: spec.runtime?.persistence,
        targetNamespace: spec.targetNamespace || "",
        executionMode: spec.dataIndex ? "history-enabled" : "quick-run",
        gatewayIngress: {
          enabled: spec.gateway?.ingress?.enabled ?? false,
          host: spec.gateway?.ingress?.host,
          ingressClassName: spec.gateway?.ingress?.ingressClassName,
        },
        dataIndex: spec.dataIndex?.persistence?.postgresql
          ? {
              postgresqlSecretName: spec.dataIndex.persistence.postgresql.secretRef?.name ?? "",
              postgresqlServiceName: spec.dataIndex.persistence.postgresql.serviceRef?.name ?? "",
              postgresqlServiceNamespace: spec.dataIndex.persistence.postgresql.serviceRef?.namespace,
              databaseName: spec.dataIndex.persistence.postgresql.serviceRef?.databaseName,
              databaseSchema: spec.dataIndex.persistence.postgresql.serviceRef?.databaseSchema,
            }
          : undefined,
        vector: spec.vector
          ? {
              watchNamespaces: spec.vector.watchNamespaces as string[] | undefined,
              debugEvents: spec.vector.debugEvents,
            }
          : undefined,
      };
    }
    return {
      targetNamespace: "",
      executionMode: "history-enabled",
      gatewayIngress: {
        enabled: true,
      },
    };
  };

  // Wizard state
  const [draft, setDraft] = useState<PlatformSetupDraft>(initializeDraft);

  const [currentStep, setCurrentStep] = useState(0);

  const handleDraftUpdate = useCallback((updates: Partial<PlatformSetupDraft>): void => {
    setDraft((prev) => ({ ...prev, ...updates }));
  }, []);

  // Setup wizard for absent or discovery-forbidden platform, or edit mode
  return (
    <Wizard
      startIndex={currentStep + 1}
      onStepChange={(_event, currentStepObj, _prevStepObj) => {
        // WizardStepType has an index property (1-based)
        const newIndex = (currentStepObj as { index?: number }).index;
        if (newIndex !== undefined) {
          setCurrentStep(newIndex - 1); // Convert to 0-based
        }
      }}
      onClose={onCancel}
    >
      <WizardStep name="Target namespace" id="target-namespace">
        <TargetNamespaceStep
          draft={draft}
          onUpdate={handleDraftUpdate}
          canCreateNamespace={canCreateNamespace}
          editMode={editMode}
        />
      </WizardStep>
      <WizardStep name="Execution mode" id="execution-mode">
        <ExecutionModeStep draft={draft} onUpdate={handleDraftUpdate} />
      </WizardStep>
      <WizardStep name="Data Index" id="data-index" isHidden={draft.executionMode !== "history-enabled"}>
        <DataIndexStep draft={draft} onUpdate={handleDraftUpdate} />
      </WizardStep>
      <WizardStep name="Vector" id="vector" isHidden={draft.executionMode !== "history-enabled"}>
        <VectorStep draft={draft} onUpdate={handleDraftUpdate} />
      </WizardStep>
      <WizardStep name="Gateway" id="gateway">
        <GatewayStep draft={draft} onUpdate={handleDraftUpdate} />
      </WizardStep>
      <WizardStep name="Runtime persistence" id="runtime-persistence">
        <RuntimePersistenceStep value={draft.runtimePersistence} change={runtimePersistence => handleDraftUpdate({ runtimePersistence })} />
      </WizardStep>
      <WizardStep name="Review" id="review">
        <ReviewStep
          draft={draft}
          onComplete={onComplete}
          onCancel={onCancel}
          editMode={editMode}
          existingPlatform={existingPlatform}
        />
      </WizardStep>
    </Wizard>
  );
};
