/**
 * Tests for operator discovery.
 */
import { describe, it, expect, vi } from "vitest";
import { discoverOperatorInstallation, performDiscovery } from "./discovery.ts";
import type { KubernetesTransport, GatewayTransport } from "../contracts/index.ts";

describe("discoverOperatorInstallation", () => {
  it("returns installed when all kinds are served", async () => {
    const transport: KubernetesTransport = {
      get: vi.fn(),
      list: vi.fn(() => Promise.resolve({
        apiVersion: "logic.kubesmarts.org/v1",
        kind: "LogicFlowRuntimeList",
        items: [],
        metadata: {},
      })),
      dryRun: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    const result = await discoverOperatorInstallation(transport);

    expect(result.kind).toBe("installed");
    if (result.kind === "installed") {
      expect(result.servedKinds).toHaveLength(4);
      expect(result.servedKinds).toContain("ClusterLogicPlatform");
      expect(result.servedKinds).toContain("LogicFlowRuntime");
      expect(result.servedKinds).toContain("LogicFlowDefinition");
      expect(result.servedKinds).toContain("LogicFlowService");
    }
  });

  it("returns missing-apis when no kinds are served", async () => {
    const transport: KubernetesTransport = {
      get: vi.fn(),
      list: vi.fn(() => Promise.reject({ status: 404, message: "Not found" })),
      dryRun: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    const result = await discoverOperatorInstallation(transport);

    expect(result.kind).toBe("missing-apis");
    if (result.kind === "missing-apis") {
      expect(result.missing).toHaveLength(4);
    }
  });

  it("returns partial-install when some kinds are served", async () => {
    let callCount = 0;
    const transport: KubernetesTransport = {
      get: vi.fn(),
      list: vi.fn(() => {
        callCount++;
        // First two succeed, last two fail
        if (callCount <= 2) {
          return Promise.resolve({
            apiVersion: "logic.kubesmarts.org/v1",
            kind: "List",
            items: [],
            metadata: {},
          });
        }
        return Promise.reject({ status: 404, message: "Not found" });
      }),
      dryRun: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    const result = await discoverOperatorInstallation(transport);

    expect(result.kind).toBe("partial-install");
    if (result.kind === "partial-install") {
      expect(result.served).toHaveLength(2);
      expect(result.missing).toHaveLength(2);
    }
  });

  it("returns forbidden-discovery when access is denied", async () => {
    const transport: KubernetesTransport = {
      get: vi.fn(),
      list: vi.fn(() => Promise.reject({ status: 403, message: "Forbidden" })),
      dryRun: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    const result = await discoverOperatorInstallation(transport);

    expect(result.kind).toBe("forbidden-discovery");
    if (result.kind === "forbidden-discovery") {
      expect(result.attempted).toBe("logic.kubesmarts.org/v1");
    }
  });

  it("returns api-unreachable when network error occurs", async () => {
    const transport: KubernetesTransport = {
      get: vi.fn(),
      list: vi.fn(() => Promise.reject({ message: "ECONNREFUSED" })),
      dryRun: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    const result = await discoverOperatorInstallation(transport);

    expect(result.kind).toBe("api-unreachable");
  });
});

describe("performDiscovery", () => {
  it("returns separate K8s and gateway results", async () => {
    const k8sTransport: KubernetesTransport = {
      get: vi.fn(),
      list: vi.fn(() => Promise.resolve({
        apiVersion: "logic.kubesmarts.org/v1",
        kind: "List",
        items: [],
        metadata: {},
      })),
      dryRun: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    const gatewayTransport: GatewayTransport = {
      getTopology: vi.fn(),
      listDefinitions: vi.fn(() => Promise.resolve([])),
      getDefinition: vi.fn(),
      listInstances: vi.fn(),
      getInstance: vi.fn(),
      execute: vi.fn(),
      executeSync: vi.fn(),
      suspendInstance: vi.fn(),
      resumeInstance: vi.fn(),
      cancelInstance: vi.fn(),
    };

    const result = await performDiscovery(k8sTransport, gatewayTransport);

    expect(result.kubernetes.kind).toBe("installed");
    expect(result.gateway.reachable).toBe(true);
    expect(result.gateway.error).toBeUndefined();
  });

  it("reports gateway unreachable when gateway fails", async () => {
    const k8sTransport: KubernetesTransport = {
      get: vi.fn(),
      list: vi.fn(() => Promise.resolve({
        apiVersion: "logic.kubesmarts.org/v1",
        kind: "List",
        items: [],
        metadata: {},
      })),
      dryRun: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    const gatewayTransport: GatewayTransport = {
      getTopology: vi.fn(),
      listDefinitions: vi.fn(() => Promise.reject(new Error("Gateway unreachable"))),
      getDefinition: vi.fn(),
      listInstances: vi.fn(),
      getInstance: vi.fn(),
      execute: vi.fn(),
      executeSync: vi.fn(),
      suspendInstance: vi.fn(),
      resumeInstance: vi.fn(),
      cancelInstance: vi.fn(),
    };

    const result = await performDiscovery(k8sTransport, gatewayTransport);

    expect(result.kubernetes.kind).toBe("installed");
    expect(result.gateway.reachable).toBe(false);
    expect(result.gateway.error).toBe("Gateway unreachable");
  });

  it("keeps K8s actions usable when gateway is unreachable", async () => {
    const k8sTransport: KubernetesTransport = {
      get: vi.fn(),
      list: vi.fn(() => Promise.resolve({
        apiVersion: "logic.kubesmarts.org/v1",
        kind: "List",
        items: [],
        metadata: {},
      })),
      dryRun: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    const gatewayTransport: GatewayTransport = {
      getTopology: vi.fn(),
      listDefinitions: vi.fn(() => Promise.reject(new Error("Network error"))),
      getDefinition: vi.fn(),
      listInstances: vi.fn(),
      getInstance: vi.fn(),
      execute: vi.fn(),
      executeSync: vi.fn(),
      suspendInstance: vi.fn(),
      resumeInstance: vi.fn(),
      cancelInstance: vi.fn(),
    };

    const result = await performDiscovery(k8sTransport, gatewayTransport);

    // K8s should still work
    expect(result.kubernetes.kind).toBe("installed");
    // Gateway is unreachable but K8s operations remain available
    expect(result.gateway.reachable).toBe(false);
  });
});
