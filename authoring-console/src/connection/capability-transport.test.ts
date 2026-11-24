/**
 * Tests for capability transport.
 */
import { describe, it, expect, vi } from "vitest";
import { createCapabilityTransport } from "./capability-transport.ts";
import type { KubernetesTransport, ResourceAttributes } from "../contracts/index.ts";

describe("createCapabilityTransport", () => {
  it("returns allowed when access review succeeds", async () => {
    const k8sTransport: KubernetesTransport = {
      get: vi.fn(),
      list: vi.fn(),
      dryRun: vi.fn(),
      create: vi.fn(() =>
        Promise.resolve({
          apiVersion: "authorization.k8s.io/v1",
          kind: "SelfSubjectAccessReview",
          metadata: { name: "test" },
          status: { allowed: true },
        } as never)
      ),
      update: vi.fn(),
    };

    const capTransport = createCapabilityTransport(k8sTransport);

    const attributes: ResourceAttributes = {
      group: "logic.kubesmarts.org",
      resource: "logicflowdefinitions",
      verb: "create",
      namespace: "default",
    };

    const result = await capTransport.canI(attributes);

    expect(result.decision).toBe("allowed");
    expect(result.attributes).toEqual(attributes);
  });

  it("returns denied when access review returns not allowed", async () => {
    const k8sTransport: KubernetesTransport = {
      get: vi.fn(),
      list: vi.fn(),
      dryRun: vi.fn(),
      create: vi.fn(() =>
        Promise.resolve({
          apiVersion: "authorization.k8s.io/v1",
          kind: "SelfSubjectAccessReview",
          metadata: { name: "test" },
          status: { allowed: false, reason: "insufficient permissions" },
        } as never)
      ),
      update: vi.fn(),
    };

    const capTransport = createCapabilityTransport(k8sTransport);

    const attributes: ResourceAttributes = {
      group: "logic.kubesmarts.org",
      resource: "logicflowdefinitions",
      verb: "delete",
      namespace: "default",
    };

    const result = await capTransport.canI(attributes);

    expect(result.decision).toBe("denied");
    expect(result.reason).toBe("insufficient permissions");
  });

  it("returns unknown when access review itself fails", async () => {
    const k8sTransport: KubernetesTransport = {
      get: vi.fn(),
      list: vi.fn(),
      dryRun: vi.fn(),
      create: vi.fn(() => Promise.reject(new Error("Cannot perform access review"))),
      update: vi.fn(),
    };

    const capTransport = createCapabilityTransport(k8sTransport);

    const attributes: ResourceAttributes = {
      group: "logic.kubesmarts.org",
      resource: "logicflowdefinitions",
      verb: "create",
    };

    const result = await capTransport.canI(attributes);

    expect(result.decision).toBe("unknown");
    expect(result.reason).toContain("Cannot perform access review");
  });

  it("handles batch capability checks", async () => {
    let callCount = 0;
    const k8sTransport: KubernetesTransport = {
      get: vi.fn(),
      list: vi.fn(),
      dryRun: vi.fn(),
      create: vi.fn(() => {
        callCount++;
        return Promise.resolve({
          apiVersion: "authorization.k8s.io/v1",
          kind: "SelfSubjectAccessReview",
          metadata: { name: "test" },
          status: { allowed: callCount % 2 === 1 }, // Alternate allowed/denied
        } as never);
      }),
      update: vi.fn(),
    };

    const capTransport = createCapabilityTransport(k8sTransport);

    const attributesList: ResourceAttributes[] = [
      { group: "logic.kubesmarts.org", resource: "logicflowdefinitions", verb: "create" },
      { group: "logic.kubesmarts.org", resource: "logicflowruntimes", verb: "create" },
      { group: "", resource: "namespaces", verb: "create" },
    ];

    const results = await capTransport.canIBatch(attributesList);

    expect(results).toHaveLength(3);
    expect(results[0]?.decision).toBe("allowed");
    expect(results[1]?.decision).toBe("denied");
    expect(results[2]?.decision).toBe("allowed");
  });
});
