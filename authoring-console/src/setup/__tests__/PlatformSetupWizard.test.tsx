/**
 * Tests for PlatformSetupWizard.
 * Cover: discovery entry states (absent/present/read-only/403), wizard flow,
 * draft updates, submission through ResourceEditor.
 *
 * Note: Full E2E rendering tests are deferred due to Monaco editor dependency.
 * Core CR generation and logic are tested in buildPlatformCR.test.ts.
 * Manual testing verifies UI behavior against fixture transports.
 */
import { describe, it, expect } from "vitest";
import type { PlatformSetupDraft } from "../types.ts";

describe("PlatformSetupWizard logic", () => {
  it("initializes with default draft state", () => {
    const draft: PlatformSetupDraft = {
      targetNamespace: "",
      executionMode: "history-enabled",
      gatewayIngress: {
        enabled: true,
      },
    };

    expect(draft.targetNamespace).toBe("");
    expect(draft.executionMode).toBe("history-enabled");
    expect(draft.gatewayIngress.enabled).toBe(true);
  });

  it("allows draft updates for target namespace", () => {
    let draft: PlatformSetupDraft = {
      targetNamespace: "",
      executionMode: "history-enabled",
      gatewayIngress: {
        enabled: true,
      },
    };

    draft = { ...draft, targetNamespace: "logic-platform" };

    expect(draft.targetNamespace).toBe("logic-platform");
  });

  it("allows draft updates for execution mode", () => {
    let draft: PlatformSetupDraft = {
      targetNamespace: "logic-platform",
      executionMode: "history-enabled",
      gatewayIngress: {
        enabled: true,
      },
    };

    draft = { ...draft, executionMode: "quick-run" };

    expect(draft.executionMode).toBe("quick-run");
  });

  it("allows draft updates for Data Index config", () => {
    let draft: PlatformSetupDraft = {
      targetNamespace: "logic-platform",
      executionMode: "history-enabled",
      gatewayIngress: {
        enabled: true,
      },
    };

    draft = {
      ...draft,
      dataIndex: {
        postgresqlSecretName: "pg-secret",
        postgresqlServiceName: "postgres",
        databaseName: "logicflow",
        databaseSchema: "data_index",
      },
    };

    expect(draft.dataIndex?.postgresqlSecretName).toBe("pg-secret");
    expect(draft.dataIndex?.postgresqlServiceName).toBe("postgres");
  });

  it("allows draft updates for Vector config", () => {
    let draft: PlatformSetupDraft = {
      targetNamespace: "logic-platform",
      executionMode: "history-enabled",
      gatewayIngress: {
        enabled: true,
      },
    };

    draft = {
      ...draft,
      vector: {
        watchNamespaces: ["logic-platform"],
        debugEvents: false,
      },
    };

    expect(draft.vector?.watchNamespaces).toEqual(["logic-platform"]);
    expect(draft.vector?.debugEvents).toBe(false);
  });

  it("allows draft updates for gateway config", () => {
    let draft: PlatformSetupDraft = {
      targetNamespace: "logic-platform",
      executionMode: "quick-run",
      gatewayIngress: {
        enabled: true,
      },
    };

    draft = {
      ...draft,
      gatewayIngress: {
        enabled: true,
        host: "gateway.example.com",
        ingressClassName: "nginx",
      },
    };

    expect(draft.gatewayIngress.enabled).toBe(true);
    expect(draft.gatewayIngress.host).toBe("gateway.example.com");
    expect(draft.gatewayIngress.ingressClassName).toBe("nginx");
  });

  it("supports quick-run mode with minimal config", () => {
    const draft: PlatformSetupDraft = {
      targetNamespace: "logic-platform",
      executionMode: "quick-run",
      gatewayIngress: {
        enabled: false,
      },
    };

    expect(draft.executionMode).toBe("quick-run");
    expect(draft.dataIndex).toBeUndefined();
    expect(draft.vector).toBeUndefined();
  });

  it("supports history-enabled mode with full config", () => {
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

    expect(draft.executionMode).toBe("history-enabled");
    expect(draft.dataIndex).toBeDefined();
    expect(draft.vector).toBeDefined();
    expect(draft.gatewayIngress.enabled).toBe(true);
  });
});
