/**
 * Family resolution tests.
 *
 * Coverage:
 * - Unambiguous resolution (single CR found)
 * - Ambiguous resolution (multiple CRs claim same version)
 * - Not found (no CR matches)
 * - Hand-authored CR names (e.g. operator sample `hello-world-v1-0-0`)
 */

import { describe, it, expect } from "vitest";
import { resolveWorkflowVersion } from "../family-resolution.ts";
import type {
  KubernetesTransport,
  WorkflowVersionKey,
  KubeObject,
  LogicFlowDefinitionSpec,
  LogicFlowDefinitionStatus,
  GroupVersionKind,
  ListOptions,
  KubeList,
} from "../../../contracts/index.ts";
import { OperatorLabels } from "../../../contracts/index.ts";

// Mock transport for testing
const createMockTransport = (
  items: Array<KubeObject<LogicFlowDefinitionSpec, LogicFlowDefinitionStatus>>,
): KubernetesTransport => {
  return {
    get: async () => {
      throw new Error("Not implemented");
    },
    list: async <TSpec, TStatus>(
      _gvk: GroupVersionKind,
      options: ListOptions,
    ): Promise<KubeList<KubeObject<TSpec, TStatus>>> => {
      // Filter items by namespace if specified
      let filteredItems = items;
      if (options.namespace !== undefined) {
        filteredItems = items.filter((item) => item.metadata.namespace === options.namespace);
      }
      // Filter by labelSelector if specified (simple implementation for testing)
      if (options.labelSelector) {
        const selectors = options.labelSelector.split(",");
        filteredItems = filteredItems.filter((item) => {
          const labels = item.metadata.labels ?? {};
          return selectors.every((selector) => {
            const [key, value] = selector.split("=");
            return labels[key!] === value;
          });
        });
      }
      return {
        apiVersion: "logic.kubesmarts.org/v1",
        kind: "LogicFlowDefinitionList",
        items: filteredItems as KubeObject<TSpec, TStatus>[],
        metadata: {},
      };
    },
    dryRun: async () => {
      throw new Error("Not implemented");
    },
    create: async () => {
      throw new Error("Not implemented");
    },
    update: async () => {
      throw new Error("Not implemented");
    },
  };
};

const createDefinitionCr = (
  name: string,
  namespace: string,
  workflowName: string,
  version: string,
): KubeObject<LogicFlowDefinitionSpec, LogicFlowDefinitionStatus> => ({
  apiVersion: "logic.kubesmarts.org/v1",
  kind: "LogicFlowDefinition",
  metadata: {
    name,
    namespace,
    labels: {
      [OperatorLabels.workflowName]: workflowName,
      [OperatorLabels.workflowVersion]: version,
    },
  },
  spec: {
    runtimeRef: { name: "test-runtime" },
    flow: {
      document: {
        dsl: "1.0.0",
        namespace,
        name: workflowName,
        version,
      },
      do: [],
    },
  },
});

describe("resolveWorkflowVersion", () => {
  describe("unambiguous resolution", () => {
    it("resolves a single matching CR", async () => {
      const cr = createDefinitionCr("orders-v-1-2-3", "default", "orders", "1.2.3");
      const transport = createMockTransport([cr]);

      const versionKey: WorkflowVersionKey = {
        namespace: "default",
        workflowName: "orders",
        version: "1.2.3",
      };

      const result = await resolveWorkflowVersion(transport, versionKey);

      expect(result).toEqual({
        kind: "unambiguous",
        resolution: {
          version: versionKey,
          resource: {
            gvk: {
              group: "logic.kubesmarts.org",
              version: "v1",
              kind: "LogicFlowDefinition",
            },
            name: "orders-v-1-2-3",
            namespace: "default",
          },
        },
      });
    });

    it("resolves hand-authored CR name (operator sample)", async () => {
      // Operator sample uses `hello-world-v1-0-0` (no hyphens between version parts)
      const cr = createDefinitionCr("hello-world-v1-0-0", "default", "hello-world", "1.0.0");
      const transport = createMockTransport([cr]);

      const versionKey: WorkflowVersionKey = {
        namespace: "default",
        workflowName: "hello-world",
        version: "1.0.0",
      };

      const result = await resolveWorkflowVersion(transport, versionKey);

      expect(result).toEqual({
        kind: "unambiguous",
        resolution: {
          version: versionKey,
          resource: {
            gvk: {
              group: "logic.kubesmarts.org",
              version: "v1",
              kind: "LogicFlowDefinition",
            },
            name: "hello-world-v1-0-0",
            namespace: "default",
          },
        },
      });
    });

    it("resolves CR with arbitrary name (labels matter, not name)", async () => {
      // CR name can be anything; labels are authoritative
      const cr = createDefinitionCr("some-arbitrary-name", "prod", "api", "2.0.0");
      const transport = createMockTransport([cr]);

      const versionKey: WorkflowVersionKey = {
        namespace: "prod",
        workflowName: "api",
        version: "2.0.0",
      };

      const result = await resolveWorkflowVersion(transport, versionKey);

      expect(result.kind).toBe("unambiguous");
      if (result.kind === "unambiguous") {
        expect(result.resolution.resource.name).toBe("some-arbitrary-name");
      }
    });
  });

  describe("ambiguous resolution", () => {
    it("surfaces ambiguity when multiple CRs claim same version", async () => {
      const cr1 = createDefinitionCr("orders-v-1-0-0-first", "default", "orders", "1.0.0");
      const cr2 = createDefinitionCr("orders-v-1-0-0-second", "default", "orders", "1.0.0");
      const transport = createMockTransport([cr1, cr2]);

      const versionKey: WorkflowVersionKey = {
        namespace: "default",
        workflowName: "orders",
        version: "1.0.0",
      };

      const result = await resolveWorkflowVersion(transport, versionKey);

      expect(result).toEqual({
        kind: "ambiguous",
        candidates: [
          {
            gvk: {
              group: "logic.kubesmarts.org",
              version: "v1",
              kind: "LogicFlowDefinition",
            },
            name: "orders-v-1-0-0-first",
            namespace: "default",
          },
          {
            gvk: {
              group: "logic.kubesmarts.org",
              version: "v1",
              kind: "LogicFlowDefinition",
            },
            name: "orders-v-1-0-0-second",
            namespace: "default",
          },
        ],
      });
    });

    it("surfaces all candidates in ambiguous case", async () => {
      const crs = [
        createDefinitionCr("api-v-1-0-0-a", "prod", "api", "1.0.0"),
        createDefinitionCr("api-v-1-0-0-b", "prod", "api", "1.0.0"),
        createDefinitionCr("api-v-1-0-0-c", "prod", "api", "1.0.0"),
      ];
      const transport = createMockTransport(crs);

      const versionKey: WorkflowVersionKey = {
        namespace: "prod",
        workflowName: "api",
        version: "1.0.0",
      };

      const result = await resolveWorkflowVersion(transport, versionKey);

      expect(result.kind).toBe("ambiguous");
      if (result.kind === "ambiguous") {
        expect(result.candidates).toHaveLength(3);
      }
    });
  });

  describe("not found", () => {
    it("returns not-found when no CR matches", async () => {
      const transport = createMockTransport([]);

      const versionKey: WorkflowVersionKey = {
        namespace: "default",
        workflowName: "nonexistent",
        version: "1.0.0",
      };

      const result = await resolveWorkflowVersion(transport, versionKey);

      expect(result).toEqual({ kind: "not-found" });
    });

    it("returns not-found when namespace differs", async () => {
      const cr = createDefinitionCr("orders-v-1-0-0", "default", "orders", "1.0.0");
      const transport = createMockTransport([cr]);

      const versionKey: WorkflowVersionKey = {
        namespace: "other-namespace", // Different namespace
        workflowName: "orders",
        version: "1.0.0",
      };

      const result = await resolveWorkflowVersion(transport, versionKey);

      expect(result).toEqual({ kind: "not-found" });
    });
  });
});
