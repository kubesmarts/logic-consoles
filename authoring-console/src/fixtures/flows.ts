/**
 * Portable Open Workflow Specification (OWS 1.0.0) documents used as `spec.flow`.
 *
 * These are authoring content only — no credentials, no execution input. They are
 * valid enough to render in the CNCF diagram editor and to round-trip through YAML.
 */
import type { WorkflowDocument } from "../contracts/index.ts";

/** hello-world @ 1.0.0 — the onboarding example family. */
export const helloWorldFlowV1: WorkflowDocument = {
  document: {
    dsl: "1.0.0",
    namespace: "default",
    name: "hello-world",
    version: "1.0.0",
  },
  do: [
    {
      greet: {
        set: {
          message: "Hello, world!",
        },
      },
    },
  ],
};

/** hello-world @ 1.1.0 — the second version published on the same runtime. */
export const helloWorldFlowV11: WorkflowDocument = {
  document: {
    dsl: "1.0.0",
    namespace: "default",
    name: "hello-world",
    version: "1.1.0",
  },
  do: [
    {
      greet: {
        set: {
          message: "Hello again, world!",
        },
      },
    },
  ],
};

/**
 * payments @ 2.1.0 — the CR-name ≠ workflow-name case. The workflow document name is
 * "payments" but the Kubernetes CR is hand-authored as "legacy-payment-flow".
 */
export const paymentsFlowV21: WorkflowDocument = {
  document: {
    dsl: "1.0.0",
    namespace: "default",
    name: "payments",
    version: "2.1.0",
  },
  do: [
    {
      authorize: {
        set: {
          approved: true,
        },
      },
    },
  ],
};
