/**
 * Gateway transport tests over MSW. Verifies the verified routes, the HATEOAS links
 * (including first-class suspend/resume/cancel), that getDefinition returns only
 * spec.flow, that execute distinguishes 202 (async) from 200 (sync), and that the
 * error taxonomy maps 503/502/unreachable and an empty catalog to distinct results.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mockServer } from "../src/fixtures/msw/server.ts";
import { createFetchGatewayTransport } from "../src/fixtures/gateway-transport.ts";
import {
  gatewayEmptyHandlers,
  gatewayIndexPendingHandlers,
  gatewayUnreachableHandlers,
  gatewayUpstreamErrorHandlers,
  topologyPartialHandlers,
} from "../src/fixtures/msw/handlers.ts";
import type { GatewayError } from "../src/contracts/index.ts";

const gateway = createFetchGatewayTransport();

afterEach(() => mockServer.resetHandlers());

describe("gateway happy path", () => {
  it("lists definitions with first-class lifecycle links", async () => {
    const catalog = await gateway.listDefinitions();
    expect(catalog.map((d) => `${d.name}@${d.version}`)).toContain("hello-world@1.0.0");
    const hello = catalog.find((d) => d.name === "hello-world");
    expect(hello?._links.suspend.templated).toBe(true);
    expect(hello?._links.resume.operationId).toBe("resumeInstanceVersioned");
    expect(hello?._links.cancel.href).toContain("/instance/{id}/cancel");
  });

  it("getDefinition returns only the portable spec.flow document", async () => {
    const flow = await gateway.getDefinition({ namespace: "default", workflowName: "hello-world", version: "1.0.0" });
    expect(flow.document.name).toBe("hello-world");
    expect(flow.document.version).toBe("1.0.0");
    // It is the flow document, not a Kubernetes CR envelope.
    expect((flow as Record<string, unknown>)["metadata"]).toBeUndefined();
  });

  it("distinguishes sync (200 + output) from async (202 + instance id)", async () => {
    const catalog = await gateway.listDefinitions();
    const hello = catalog.find((d) => d.name === "hello-world");
    expect(hello).toBeDefined();
    const sync = await gateway.executeSync(hello!._links.executeSync, { greeting: "hi" });
    expect(sync.output).toEqual({ message: "Hello, world!" });
    const async = await gateway.execute(hello!._links.execute, { greeting: "hi" });
    expect(async.instanceId).toMatch(/^[0-9a-f-]+$/);
  });

  it("partial topology keeps nodes and flags discovery.partial", async () => {
    mockServer.use(...topologyPartialHandlers);
    const graph = await gateway.getTopology("default");
    expect(graph.discovery.partial).toBe(true);
    expect(graph.discovery.warnings[0]?.code).toBe("RuntimeUnreadable");
    expect(graph.nodes.length).toBeGreaterThan(0);
  });
});

describe("gateway error taxonomy", () => {
  const expectError = async (promise: Promise<unknown>): Promise<GatewayError> => {
    try {
      await promise;
    } catch (error) {
      return error as GatewayError;
    }
    throw new Error("expected the call to reject");
  };

  it("maps 503 on instances to index-pending", async () => {
    mockServer.use(...gatewayIndexPendingHandlers);
    const error = await expectError(gateway.listInstances({ namespace: "default" }));
    expect(error.kind).toBe("index-pending");
  });

  it("maps 502 on instances to upstream-error", async () => {
    mockServer.use(...gatewayUpstreamErrorHandlers);
    const error = await expectError(gateway.listInstances({ namespace: "default" }));
    expect(error.kind).toBe("upstream-error");
  });

  it("maps a network failure to unreachable", async () => {
    mockServer.use(...gatewayUnreachableHandlers);
    const error = await expectError(gateway.getTopology("default"));
    expect(error.kind).toBe("unreachable");
  });

  it("returns an empty catalog as a successful empty list, not an error", async () => {
    mockServer.use(...gatewayEmptyHandlers);
    await expect(gateway.listDefinitions()).resolves.toEqual([]);
    await expect(gateway.listInstances({ namespace: "default" })).resolves.toEqual([]);
  });
});
