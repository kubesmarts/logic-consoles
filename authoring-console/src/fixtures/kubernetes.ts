/**
 * Kubernetes CR fixtures.
 *
 * The important invariant this encodes: the CR `metadata.name` is SEPARATE from the
 * workflow document name.
 * - hello-world versions use console-generated CR names (`hello-world-v-1-0-0`, etc).
 * - payments @ 2.1.0 is a HAND-AUTHORED CR named `legacy-payment-flow` — the
 *   CR-name ≠ workflow-name case the brief requires.
 */
import type {
  ClusterLogicPlatformSpec,
  KubeObject,
  LogicFlowDefinitionSpec,
  LogicFlowDefinitionStatus,
  LogicFlowRuntimeSpec,
} from "../contracts/index.ts";
import {
  LOGIC_GROUP_VERSION,
  LogicKinds,
  OperatorLabels,
  PersistenceModes,
} from "../contracts/index.ts";
import { helloWorldFlowV1, helloWorldFlowV11, paymentsFlowV21 } from "./flows.ts";

type DefinitionObject = KubeObject<LogicFlowDefinitionSpec, LogicFlowDefinitionStatus>;

const definitionLabels = (workflowName: string, version: string, namespace: string) => ({
  [OperatorLabels.workflowName]: workflowName,
  [OperatorLabels.workflowVersion]: version,
  [OperatorLabels.workflowNamespace]: namespace,
});

const readyConditions = (generation: number) => [
  {
    type: "Ready",
    status: "True" as const,
    reason: "Reconciled",
    message: "Definition reconciled.",
    observedGeneration: generation,
    lastTransitionTime: "2026-11-20T10:00:00Z",
  },
];

/** hello-world @ 1.0.0, CR name hello-world-v-1-0-0 (console-generated style). */
export const helloWorldDefinitionV1: DefinitionObject = {
  apiVersion: LOGIC_GROUP_VERSION,
  kind: LogicKinds.LogicFlowDefinition,
  metadata: {
    name: "hello-world-v-1-0-0",
    namespace: "default",
    resourceVersion: "1001",
    generation: 1,
    uid: "uid-hello-100",
    labels: definitionLabels("hello-world", "1.0.0", "default"),
    creationTimestamp: "2026-11-20T09:00:00Z",
  },
  spec: { runtimeRef: { name: "hello-runtime" }, flow: helloWorldFlowV1 },
  status: {
    observedGeneration: 1,
    workflowName: "hello-world",
    workflowVersion: "1.0.0",
    workflowNamespace: "default",
    conditions: readyConditions(1),
  },
};

/** hello-world @ 1.1.0, CR name hello-world-v-1-1-0, same runtime. */
export const helloWorldDefinitionV11: DefinitionObject = {
  apiVersion: LOGIC_GROUP_VERSION,
  kind: LogicKinds.LogicFlowDefinition,
  metadata: {
    name: "hello-world-v-1-1-0",
    namespace: "default",
    resourceVersion: "1010",
    generation: 1,
    uid: "uid-hello-110",
    labels: definitionLabels("hello-world", "1.1.0", "default"),
    creationTimestamp: "2026-11-20T09:30:00Z",
  },
  spec: { runtimeRef: { name: "hello-runtime" }, flow: helloWorldFlowV11 },
  status: {
    observedGeneration: 1,
    workflowName: "hello-world",
    workflowVersion: "1.1.0",
    workflowNamespace: "default",
    conditions: readyConditions(1),
  },
};

/**
 * payments @ 2.1.0 — HAND-AUTHORED CR name. metadata.name ("legacy-payment-flow")
 * deliberately does NOT derive from the workflow name ("payments").
 */
export const paymentsDefinitionV21: DefinitionObject = {
  apiVersion: LOGIC_GROUP_VERSION,
  kind: LogicKinds.LogicFlowDefinition,
  metadata: {
    name: "legacy-payment-flow",
    namespace: "default",
    resourceVersion: "2001",
    generation: 2,
    uid: "uid-payments-210",
    labels: definitionLabels("payments", "2.1.0", "default"),
    creationTimestamp: "2026-11-19T08:00:00Z",
  },
  spec: { runtimeRef: { name: "orders-runtime" }, flow: paymentsFlowV21 },
  status: {
    observedGeneration: 2,
    workflowName: "payments",
    workflowVersion: "2.1.0",
    workflowNamespace: "default",
    conditions: readyConditions(2),
  },
};

export const definitionFixtures: readonly DefinitionObject[] = [
  helloWorldDefinitionV1,
  helloWorldDefinitionV11,
  paymentsDefinitionV21,
];

export const runtimeFixtures: readonly KubeObject<LogicFlowRuntimeSpec>[] = [
  {
    apiVersion: LOGIC_GROUP_VERSION,
    kind: LogicKinds.LogicFlowRuntime,
    metadata: { name: "hello-runtime", namespace: "default", resourceVersion: "500", generation: 1, uid: "uid-rt-hello" },
    spec: { platformRef: { name: "cluster-platform" }, persistenceMode: PersistenceModes.Ephemeral },
  },
  {
    apiVersion: LOGIC_GROUP_VERSION,
    kind: LogicKinds.LogicFlowRuntime,
    metadata: { name: "orders-runtime", namespace: "default", resourceVersion: "510", generation: 1, uid: "uid-rt-orders" },
    spec: { platformRef: { name: "cluster-platform" }, persistenceMode: PersistenceModes.PlatformDB },
  },
];

/** Cluster-scoped singleton; targetNamespace is immutable after creation. */
export const platformFixture: KubeObject<ClusterLogicPlatformSpec> = {
  apiVersion: LOGIC_GROUP_VERSION,
  kind: LogicKinds.ClusterLogicPlatform,
  metadata: { name: "cluster-platform", resourceVersion: "100", generation: 1, uid: "uid-platform" },
  spec: { targetNamespace: "logic-system" },
};
