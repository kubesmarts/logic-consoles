/**
 * MSW mock handlers for the verified gateway HTTP routes.
 *
 * `defaultHandlers` is the happy path (reachable gateway, full topology, catalog with
 * both editions, instances present). Scenario handler groups let any consumer (packets
 * B–H) exercise the forbidden / loading / unavailable states by calling
 * `server.use(...)` / `worker.use(...)`:
 *   - gatewayUnreachableHandlers   — network failure on every route
 *   - gatewayIndexPendingHandlers  — 503 on instances (Data Index pending)
 *   - gatewayUpstreamErrorHandlers — 502 on instances (upstream error)
 *   - gatewayEmptyHandlers         — empty catalog + empty history
 *   - topologyPartialHandlers      — partial topology graph with a warning
 */
import { http, HttpResponse } from "msw";
import { GATEWAY_BASE_URL } from "../gateway-transport.ts";
import { catalogFixture } from "../catalog.ts";
import { helloWorldFlowV1, helloWorldFlowV11, paymentsFlowV21 } from "../flows.ts";
import { executeAsyncFixture, executeSyncFixture, instanceFixtures } from "../instances.ts";
import { topologyFullFixture, topologyPartialFixture } from "../topology.ts";
import type { WorkflowDocument } from "../../contracts/index.ts";

const base = GATEWAY_BASE_URL;

const flowByKey: Record<string, WorkflowDocument> = {
  "default/hello-world/1.0.0": helloWorldFlowV1,
  "default/hello-world/1.1.0": helloWorldFlowV11,
  "default/payments/2.1.0": paymentsFlowV21,
};

export const defaultHandlers = [
  http.get(`${base}/v1/topology`, () => HttpResponse.json(topologyFullFixture)),

  http.get(`${base}/v1/definitions/`, () => HttpResponse.json(catalogFixture)),

  http.get(`${base}/v1/definitions/:namespace/:name/:version`, ({ params }) => {
    const key = `${params["namespace"]}/${params["name"]}/${params["version"]}`;
    const flow = flowByKey[key];
    if (!flow) {
      return HttpResponse.json({ error: "workflow definition not found" }, { status: 404 });
    }
    return HttpResponse.json(flow);
  }),

  http.get(`${base}/v1/instances/`, ({ request }) => {
    const url = new URL(request.url);
    const name = url.searchParams.get("name");
    const version = url.searchParams.get("version");
    const status = url.searchParams.get("status");
    const items = instanceFixtures.filter(
      (i) =>
        (!name || i.name === name) &&
        (!version || i.version === version) &&
        (!status || i.status === status),
    );
    return HttpResponse.json(items);
  }),

  http.get(`${base}/v1/instances/:id`, ({ params }) => {
    const instance = instanceFixtures.find((i) => i.id === params["id"]);
    if (!instance) {
      return HttpResponse.json({ error: "instance not found" }, { status: 404 });
    }
    return HttpResponse.json(instance);
  }),

  // Execute — sync must be registered before the async catch-all for the same prefix.
  http.post(`${base}/v1/runtime/:namespace/:name/:version/sync`, () =>
    HttpResponse.json(executeSyncFixture.raw as Record<string, unknown>, { status: 200 }),
  ),
  http.post(`${base}/v1/runtime/:namespace/:name/:version`, () =>
    HttpResponse.json(executeAsyncFixture.raw as Record<string, unknown>, { status: 202 }),
  ),

  // Instance lifecycle (first-class, templated by instance id).
  http.post(`${base}/v1/runtime/:namespace/:name/:version/instance/:id/suspend`, ({ params }) =>
    HttpResponse.json({ instanceId: params["id"], status: "SUSPENDED" }, { status: 200 }),
  ),
  http.post(`${base}/v1/runtime/:namespace/:name/:version/instance/:id/resume`, ({ params }) =>
    HttpResponse.json({ instanceId: params["id"], status: "ACTIVE" }, { status: 200 }),
  ),
  http.post(`${base}/v1/runtime/:namespace/:name/:version/instance/:id/cancel`, ({ params }) =>
    HttpResponse.json({ instanceId: params["id"], status: "ABORTED" }, { status: 200 }),
  ),
];

export const gatewayUnreachableHandlers = [
  http.get(`${base}/v1/*`, () => HttpResponse.error()),
  http.post(`${base}/v1/*`, () => HttpResponse.error()),
];

export const gatewayIndexPendingHandlers = [
  http.get(`${base}/v1/instances/`, () =>
    HttpResponse.json({ error: "data index not available" }, { status: 503 }),
  ),
  http.get(`${base}/v1/instances/:id`, () =>
    HttpResponse.json({ error: "data index not available" }, { status: 503 }),
  ),
];

export const gatewayUpstreamErrorHandlers = [
  http.get(`${base}/v1/instances/`, () =>
    HttpResponse.json({ error: "upstream error" }, { status: 502 }),
  ),
  http.get(`${base}/v1/instances/:id`, () =>
    HttpResponse.json({ error: "upstream error" }, { status: 502 }),
  ),
];

export const gatewayEmptyHandlers = [
  http.get(`${base}/v1/definitions/`, () => HttpResponse.json([])),
  http.get(`${base}/v1/instances/`, () => HttpResponse.json([])),
];

export const topologyPartialHandlers = [
  http.get(`${base}/v1/topology`, () => HttpResponse.json(topologyPartialFixture)),
];
