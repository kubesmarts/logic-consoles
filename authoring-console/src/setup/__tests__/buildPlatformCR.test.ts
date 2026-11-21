/**
 * Tests for buildPlatformCR utility.
 * Verifies CR generation against operator types (clusterlogicplatform_types.go).
 */
import { describe, it, expect } from "vitest";
import { buildPlatformCR } from "../buildPlatformCR.ts";
import { LOGIC_GROUP, LOGIC_VERSION, LogicKinds } from "../../contracts/index.ts";
import type { PlatformSetupDraft } from "../types.ts";

describe("buildPlatformCR", () => {
  it("builds a quick-run platform CR with gateway only", () => {
    const draft: PlatformSetupDraft = {
      targetNamespace: "logic-platform",
      executionMode: "quick-run",
      gatewayIngress: {
        enabled: true,
        host: "gateway.example.com",
        ingressClassName: "nginx",
      },
    };

    const cr = buildPlatformCR(draft);

    expect(cr.apiVersion).toBe(`${LOGIC_GROUP}/${LOGIC_VERSION}`);
    expect(cr.kind).toBe(LogicKinds.ClusterLogicPlatform);
    expect(cr.metadata.name).toBe("cluster-platform");
    expect(cr.spec?.targetNamespace).toBe("logic-platform");
    expect(cr.spec?.dataIndex).toBeUndefined();
    expect(cr.spec?.vector).toBeUndefined();
    expect(cr.spec?.gateway?.ingress?.enabled).toBe(true);
    expect(cr.spec?.gateway?.ingress?.host).toBe("gateway.example.com");
    expect(cr.spec?.gateway?.ingress?.ingressClassName).toBe("nginx");
  });

  it("builds a history-enabled platform CR with Data Index and Vector", () => {
    const draft: PlatformSetupDraft = {
      targetNamespace: "logic-platform",
      executionMode: "history-enabled",
      dataIndex: {
        postgresqlSecretName: "postgresql-secret",
        postgresqlServiceName: "postgresql",
        postgresqlServiceNamespace: "databases",
        databaseName: "logicflow",
        databaseSchema: "data_index",
      },
      vector: {
        watchNamespaces: ["logic-platform"],
        debugEvents: false,
      },
      gatewayIngress: {
        enabled: true,
        host: "gateway.example.com",
      },
    };

    const cr = buildPlatformCR(draft);

    expect(cr.spec?.targetNamespace).toBe("logic-platform");
    expect(cr.spec?.dataIndex?.persistence?.postgresql?.secretRef.name).toBe("postgresql-secret");
    expect(cr.spec?.dataIndex?.persistence?.postgresql?.serviceRef.name).toBe("postgresql");
    expect(cr.spec?.dataIndex?.persistence?.postgresql?.serviceRef.namespace).toBe("databases");
    expect(cr.spec?.dataIndex?.persistence?.postgresql?.serviceRef.databaseName).toBe("logicflow");
    expect(cr.spec?.dataIndex?.persistence?.postgresql?.serviceRef.databaseSchema).toBe("data_index");
    expect(cr.spec?.vector?.watchNamespaces).toEqual(["logic-platform"]);
    expect(cr.spec?.vector?.debugEvents).toBe(false);
  });

  it("omits optional fields when not configured", () => {
    const draft: PlatformSetupDraft = {
      targetNamespace: "logic-platform",
      executionMode: "quick-run",
      gatewayIngress: {
        enabled: false,
      },
    };

    const cr = buildPlatformCR(draft);

    expect(cr.spec?.dataIndex).toBeUndefined();
    expect(cr.spec?.vector).toBeUndefined();
    expect(cr.spec?.gateway).toBeUndefined();
  });

  it("omits gateway ingress fields when disabled", () => {
    const draft: PlatformSetupDraft = {
      targetNamespace: "logic-platform",
      executionMode: "quick-run",
      gatewayIngress: {
        enabled: false,
        host: "gateway.example.com",
        ingressClassName: "nginx",
      },
    };

    const cr = buildPlatformCR(draft);

    expect(cr.spec?.gateway).toBeUndefined();
  });

  it("handles Data Index config without optional service namespace", () => {
    const draft: PlatformSetupDraft = {
      targetNamespace: "logic-platform",
      executionMode: "history-enabled",
      dataIndex: {
        postgresqlSecretName: "pg-secret",
        postgresqlServiceName: "postgres",
      },
      gatewayIngress: { enabled: false },
    };

    const cr = buildPlatformCR(draft);

    expect(cr.spec?.dataIndex?.persistence?.postgresql?.serviceRef.namespace).toBeUndefined();
    expect(cr.spec?.dataIndex?.persistence?.postgresql?.serviceRef.databaseName).toBeUndefined();
  });

  it("generates valid CR YAML structure", () => {
    const draft: PlatformSetupDraft = {
      targetNamespace: "workflows",
      executionMode: "history-enabled",
      dataIndex: {
        postgresqlSecretName: "postgresql-secret",
        postgresqlServiceName: "postgresql",
        postgresqlServiceNamespace: "databases",
        databaseName: "logicflow",
        databaseSchema: "data_index",
      },
      vector: {
        watchNamespaces: ["workflows"],
        debugEvents: false,
      },
      gatewayIngress: {
        enabled: true,
        host: "gateway.lvh.me",
        ingressClassName: "nginx",
      },
    };

    const cr = buildPlatformCR(draft);

    // Verify basic structure
    expect(cr).toHaveProperty("apiVersion");
    expect(cr).toHaveProperty("kind");
    expect(cr).toHaveProperty("metadata");
    expect(cr).toHaveProperty("spec");

    // Verify metadata
    expect(cr.metadata).toHaveProperty("name");
    expect(cr.metadata.name).toBe("cluster-platform");

    // Verify spec contains all expected top-level fields
    expect(cr.spec).toBeDefined();
    expect(cr.spec?.targetNamespace).toBeDefined();
    expect(cr.spec?.dataIndex).toBeDefined();
    expect(cr.spec?.vector).toBeDefined();
    expect(cr.spec?.gateway).toBeDefined();
  });
});
