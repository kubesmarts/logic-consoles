/**
 * Runtime setup wizard — Packet D2 deliverable.
 * Guides an admin/author to select an existing runtime or create a new LogicFlowRuntime.
 *
 * Steps:
 * 1. Mode selection (select existing OR create new)
 * 2. Basic config (name, namespace, platformRef, persistence) [create mode only]
 * 3. Replicas and logging [create mode only]
 * 4. Security configuration [create mode only]
 * 5. Review + dry-run + submit (C's ResourceEditor)
 */
import { type ReactNode, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Wizard,
  WizardStep,
  EmptyState,
  EmptyStateBody,
  Bullseye,
  Spinner,
} from "@patternfly/react-core";
import { useConsole } from "../../app/ConsoleContext.tsx";
import {
  LOGIC_GROUP,
  LOGIC_VERSION,
  LogicKinds,
  type KubeObject,
  type LogicFlowRuntimeSpec,
  type ClusterLogicPlatformSpec,
} from "../../contracts/index.ts";
import type { RuntimeSetupDraft } from "./types.ts";
import type { LogicFlowRuntimeCRSpec, LogicFlowRuntimeCRStatus } from "./buildRuntimeCR.ts";
import { ModeSelectionStep } from "./steps/ModeSelectionStep.tsx";
import { BasicConfigStep } from "./steps/BasicConfigStep.tsx";
import { ReplicasAndLoggingStep } from "./steps/ReplicasAndLoggingStep.tsx";
import { SecurityStep } from "./steps/SecurityStep.tsx";
import { RuntimeReviewStep } from "./steps/RuntimeReviewStep.tsx";

interface RuntimeSetupWizardProps {
  readonly onComplete?: () => void;
  readonly onCancel?: () => void;
  readonly initialRuntimeName?: string;
}

export const RuntimeSetupWizard = ({
  onComplete,
  onCancel,
  initialRuntimeName,
}: RuntimeSetupWizardProps): ReactNode => {
  const { session, kubernetes, capabilities } = useConsole();
  const namespace = session.namespace ?? "default";

  // Discover existing runtimes in the namespace
  const runtimesQuery = useQuery({
    queryKey: [session.sessionId, session.context.contextName, "runtimes", namespace],
    queryFn: ({ signal }) =>
      kubernetes
        .list<LogicFlowRuntimeSpec>(
          { group: LOGIC_GROUP, version: LOGIC_VERSION, kind: LogicKinds.LogicFlowRuntime },
          { namespace },
          signal,
        )
        .catch(() => ({ items: [] })), // Gracefully handle list failure
  });

  // Discover platform for platformRef and Vector watch namespaces
  const platformQuery = useQuery({
    queryKey: [session.sessionId, session.context.contextName, "platform-discovery"],
    queryFn: ({ signal }) =>
      kubernetes
        .get<ClusterLogicPlatformSpec>(
          {
            gvk: { group: LOGIC_GROUP, version: LOGIC_VERSION, kind: LogicKinds.ClusterLogicPlatform },
            name: "cluster-platform",
          },
          signal,
        )
        .catch(() => null), // Platform may not exist
  });

  // Check create permission
  const canCreateRuntimeQuery = useQuery({
    queryKey: [session.sessionId, "can-create-runtime"],
    queryFn: ({ signal }) =>
      capabilities.canI(
        {
          group: LOGIC_GROUP,
          resource: "logicflowruntimes",
          verb: "create",
          namespace,
        },
        signal,
      ),
  });

  // Initialize draft
  const initializeDraft = (): RuntimeSetupDraft => {
    const hasExistingRuntimes = (runtimesQuery.data?.items.length ?? 0) > 0;
    const canCreate = canCreateRuntimeQuery.data?.decision === "allowed";

    // If initialRuntimeName is provided and exists, start in select mode
    if (initialRuntimeName && hasExistingRuntimes) {
      const exists = runtimesQuery.data?.items.some((r) => r.metadata.name === initialRuntimeName);
      if (exists) {
        return {
          mode: "select-existing",
          selectedRuntimeName: initialRuntimeName,
          name: "",
          namespace,
          persistenceMode: "Ephemeral",
        };
      }
    }

    // Default to select-existing if runtimes exist, otherwise create-new
    return {
      mode: hasExistingRuntimes && canCreate ? "select-existing" : "create-new",
      name: "",
      namespace,
      persistenceMode: "Ephemeral",
    };
  };

  const [draft, setDraft] = useState<RuntimeSetupDraft>(initializeDraft());

  const handleDraftUpdate = useCallback((updates: Partial<RuntimeSetupDraft>): void => {
    setDraft((prev) => ({ ...prev, ...updates }));
  }, []);

  // Loading state
  if (
    runtimesQuery.isPending ||
    platformQuery.isPending ||
    canCreateRuntimeQuery.isPending
  ) {
    return (
      <Bullseye>
        <Spinner aria-label="Loading runtime setup" />
      </Bullseye>
    );
  }

  // Error handling
  if (runtimesQuery.isError) {
    return (
      <EmptyState titleText="Error loading runtimes" headingLevel="h1">
        <EmptyStateBody>
          {runtimesQuery.error instanceof Error
            ? runtimesQuery.error.message
            : "Failed to load runtimes"}
        </EmptyStateBody>
      </EmptyState>
    );
  }

  const existingRuntimes = runtimesQuery.data?.items ?? [];
  const canCreate = canCreateRuntimeQuery.data?.decision === "allowed";
  const platformName = platformQuery.data?.metadata.name;

  // Extract Vector watch namespaces from platform spec
  const vectorWatchNamespaces = platformQuery.data?.spec
    ? // Platform spec may have vector.watchNamespaces
      (platformQuery.data.spec as { vector?: { watchNamespaces?: string[] } }).vector
        ?.watchNamespaces
    : undefined;

  // If mode is select-existing, skip to review (single-step wizard)
  if (draft.mode === "select-existing") {
    // Find the selected runtime
    const selectedRuntime = existingRuntimes.find(
      (r) => r.metadata.name === draft.selectedRuntimeName,
    );

    return (
      <Wizard
        onClose={onCancel}
        onSave={() => {
          if (onComplete) onComplete();
        }}
      >
        <WizardStep name="Select runtime" id="select-runtime">
          <ModeSelectionStep
            draft={draft}
            onChange={handleDraftUpdate}
            existingRuntimes={existingRuntimes}
            canCreate={canCreate}
          />
        </WizardStep>
        {draft.selectedRuntimeName && selectedRuntime && (
          <WizardStep name="Review" id="review">
            <RuntimeReviewStep
              draft={{
                ...draft,
                name: selectedRuntime.metadata.name,
                namespace: selectedRuntime.metadata.namespace || namespace,
              }}
              onComplete={onComplete}
              onCancel={onCancel}
              editMode={false}
              existingRuntime={selectedRuntime as KubeObject<
                LogicFlowRuntimeCRSpec,
                LogicFlowRuntimeCRStatus
              >}
            />
          </WizardStep>
        )}
      </Wizard>
    );
  }

  // Create mode: multi-step wizard
  return (
    <Wizard
      onClose={onCancel}
      onSave={() => {
        if (onComplete) onComplete();
      }}
    >
      <WizardStep name="Mode selection" id="mode-selection">
        <ModeSelectionStep
          draft={draft}
          onChange={handleDraftUpdate}
          existingRuntimes={existingRuntimes}
          canCreate={canCreate}
        />
      </WizardStep>

      <WizardStep name="Basic configuration" id="basic-config">
        <BasicConfigStep
          draft={draft}
          onChange={handleDraftUpdate}
          platformName={platformName}
          activeNamespace={namespace}
        />
      </WizardStep>

      <WizardStep name="Replicas and logging" id="replicas-logging">
        <ReplicasAndLoggingStep
          draft={draft}
          onChange={handleDraftUpdate}
          vectorWatchNamespaces={vectorWatchNamespaces}
        />
      </WizardStep>

      <WizardStep name="Security" id="security">
        <SecurityStep draft={draft} onChange={handleDraftUpdate} />
      </WizardStep>

      <WizardStep name="Review and submit" id="review">
        <RuntimeReviewStep
          draft={draft}
          onComplete={onComplete}
          onCancel={onCancel}
          editMode={false}
        />
      </WizardStep>
    </Wizard>
  );
};
