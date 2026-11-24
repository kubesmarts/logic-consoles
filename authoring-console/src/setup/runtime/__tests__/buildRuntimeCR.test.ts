/**
 * Tests for buildRuntimeCR — CR construction from draft.
 * Verifies CR structure against operator field names from logicflowruntime_types.go.
 */
import { describe, it, expect } from "vitest";
import { buildRuntimeCR } from "../buildRuntimeCR.ts";
import type { RuntimeSetupDraft } from "../types.ts";
import { LOGIC_GROUP_VERSION, LogicKinds } from "../../../contracts/index.ts";

describe("buildRuntimeCR", () => {
  it("builds minimal Ephemeral runtime CR", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "my-runtime",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
    };

    const cr = buildRuntimeCR(draft);

    expect(cr.apiVersion).toBe(LOGIC_GROUP_VERSION);
    expect(cr.kind).toBe(LogicKinds.LogicFlowRuntime);
    expect(cr.metadata.name).toBe("my-runtime");
    expect(cr.metadata.namespace).toBe("workflows");
    expect(cr.spec?.persistenceMode).toBe("Ephemeral");
    expect(cr.spec?.platformRef).toBeUndefined();
  });

  it("builds PlatformDB runtime with platformRef", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "db-runtime",
      namespace: "workflows",
      persistenceMode: "PlatformDB",
      platformRef: "cluster-platform",
    };

    const cr = buildRuntimeCR(draft);

    expect(cr.spec?.persistenceMode).toBe("PlatformDB");
    expect(cr.spec?.platformRef).toEqual({ name: "cluster-platform" });
  });

  it("includes replicas when specified", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "scaled-runtime",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
      replicas: 3,
    };

    const cr = buildRuntimeCR(draft);

    expect(cr.spec?.replicas).toBe(3);
  });

  it("omits replicas when zero or undefined", () => {
    const draftUndefined: RuntimeSetupDraft = {
      mode: "create-new",
      name: "no-replicas",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
    };

    const crUndefined = buildRuntimeCR(draftUndefined);
    expect(crUndefined.spec?.replicas).toBeUndefined();

    const draftZero: RuntimeSetupDraft = {
      mode: "create-new",
      name: "zero-replicas",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
      replicas: 0,
    };

    const crZero = buildRuntimeCR(draftZero);
    expect(crZero.spec?.replicas).toBeUndefined();
  });

  it("includes structured logging configuration", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "logged-runtime",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
      structuredLogging: {
        enabled: true,
        includeWorkflowPayloads: true,
        includeTaskPayloads: false,
      },
    };

    const cr = buildRuntimeCR(draft);

    expect(cr.spec?.logging).toEqual({
      enabled: true,
      includeWorkflowPayloads: true,
      includeTaskPayloads: false,
    });
  });

  it("includes NONE security configuration", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "unsecured-runtime",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
      security: {
        type: "NONE",
      },
    };

    const cr = buildRuntimeCR(draft);

    expect(cr.spec?.security).toEqual({
      type: "NONE",
    });
  });

  it("includes API_KEY security with keys", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "apikey-runtime",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
      security: {
        type: "API_KEY",
        apiKey: {
          keys: [
            {
              name: "admin-key",
              secretName: "api-keys",
              secretKey: "admin",
              roles: ["flow-admin"],
            },
            {
              name: "invoker-key",
              secretName: "api-keys",
              secretKey: "invoker",
              roles: ["flow-invoker"],
            },
          ],
        },
      },
    };

    const cr = buildRuntimeCR(draft);

    expect(cr.spec?.security?.type).toBe("API_KEY");
    expect(cr.spec?.security?.apiKey?.keys).toHaveLength(2);
    expect(cr.spec?.security?.apiKey?.keys[0]).toEqual({
      name: "admin-key",
      secretRef: {
        name: "api-keys",
        key: "admin",
      },
      roles: ["flow-admin"],
    });
  });

  it("includes OIDC security with client secret", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "oidc-runtime",
      namespace: "workflows",
      persistenceMode: "Ephemeral",
      security: {
        type: "OIDC",
        oidc: {
          authServerUrl: "https://auth.example.com",
          clientId: "workflow-runtime",
          clientSecretName: "oidc-secret",
          clientSecretKey: "client-secret",
          rolesClaim: "groups",
        },
      },
    };

    const cr = buildRuntimeCR(draft);

    expect(cr.spec?.security?.type).toBe("OIDC");
    expect(cr.spec?.security?.oidc).toEqual({
      authServerUrl: "https://auth.example.com",
      clientId: "workflow-runtime",
      clientSecret: {
        name: "oidc-secret",
        key: "client-secret",
      },
      rolesClaim: "groups",
    });
  });

  it("builds full-featured runtime CR", () => {
    const draft: RuntimeSetupDraft = {
      mode: "create-new",
      name: "full-runtime",
      namespace: "workflows",
      platformRef: "cluster-platform",
      persistenceMode: "PlatformDB",
      replicas: 2,
      structuredLogging: {
        enabled: true,
        includeWorkflowPayloads: false,
        includeTaskPayloads: false,
      },
      security: {
        type: "API_KEY",
        apiKey: {
          keys: [
            {
              name: "service-key",
              secretName: "runtime-keys",
              secretKey: "value",
              roles: ["flow-admin", "flow-invoker"],
            },
          ],
        },
      },
    };

    const cr = buildRuntimeCR(draft);

    expect(cr.metadata.name).toBe("full-runtime");
    expect(cr.metadata.namespace).toBe("workflows");
    expect(cr.spec?.platformRef).toEqual({ name: "cluster-platform" });
    expect(cr.spec?.persistenceMode).toBe("PlatformDB");
    expect(cr.spec?.replicas).toBe(2);
    expect(cr.spec?.logging?.enabled).toBe(true);
    expect(cr.spec?.security?.type).toBe("API_KEY");
  });
});
