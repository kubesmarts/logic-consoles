/* global process, URL, fetch, AbortSignal, console */
// After npm run build, run: node launcher/smoke.mjs <kubeconfig-context>
// Exercises the built launcher and an operator-installed cluster with admin access.
// Kubernetes resource submissions use dryRun=All. The SSAR is a non-persisting review.
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createServer } from "../dist/launcher/server.js";
import { createK8sClient, getClusterDisplay } from "../dist/launcher/kubernetes-client.js";

const name = process.argv[2];
if (!name || process.argv.length !== 3) throw new Error("Usage: node launcher/smoke.mjs <kubeconfig-context>");
const client = createK8sClient(name);
const state = {
  session: { sessionId: randomUUID(), startedAt: new Date() },
  context: { contextName: name, clusterDisplay: getClusterDisplay(client.kc), selectedAt: new Date() },
  gateway: null,
};
const server = createServer({ port: 0, distPath: fileURLToPath(new URL("../dist", import.meta.url)) }, state, client);
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = `http://127.0.0.1:${server.address().port}`;

async function call(path, body, session, expected = 200) {
  const headers = { "Content-Type": "application/json" };
  if (session) {
    headers["X-Session-Id"] = session.sessionId;
    headers["X-Context-Name"] = session.context.contextName;
  }
  const response = await fetch(origin + path, {
    method: body ? "POST" : "GET", headers, body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, expected, `${path} returned ${response.status}, expected ${expected}`);
  return response.json();
}

try {
  const html = await fetch(origin);
  assert.equal(html.status, 200, "Build the browser bundle before running the smoke test");
  assert.match(await html.text(), /id="root"/);
  const initial = await call("/api/session");
  const session = await call("/api/connect", { contextName: name }, initial);
  await call("/api/discovery", undefined, initial, 409);
  const { resources } = await call("/api/discovery", undefined, session);
  for (const kind of ["ClusterLogicPlatform", "LogicFlowRuntime", "LogicFlowDefinition", "LogicFlowService"]) {
    assert(resources.some(resource => resource.kind === kind && !resource.name.includes("/")), `${kind} API missing`);
  }

  const gvk = { group: "logic.kubesmarts.org", version: "v1", kind: "ClusterLogicPlatform" };
  const { items } = await call("/api/k8s/list", { gvk }, session);
  const existing = items[0];
  const verb = existing ? "update" : "create";
  const review = await call("/api/k8s/write", {
    verb: "create", object: {
      apiVersion: "authorization.k8s.io/v1", kind: "SelfSubjectAccessReview",
      spec: { resourceAttributes: { group: gvk.group, resource: "clusterlogicplatforms", verb } },
    },
  }, session);
  assert.equal(review.status?.allowed, true, `This smoke requires platform ${verb} permission`);
  const object = existing || {
    apiVersion: "logic.kubesmarts.org/v1", kind: gvk.kind,
    metadata: { name: "default" }, spec: { targetNamespace: "default" },
  };
  const accepted = await call("/api/k8s/write", {
    object, verb, dryRun: true, expectedResourceVersion: existing?.metadata.resourceVersion,
  }, session);
  assert.equal(accepted.metadata.name, object.metadata.name);
  if (!existing) await call("/api/k8s/get", { gvk, name: object.metadata.name }, session, 404);
  await call("/api/disconnect", {}, session);
  await call("/api/discovery", undefined, session, 409);
  console.log(`Passed on ${name}: bundle, connect, discovery, access review, platform ${verb} dry-run and session invalidation.`);
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
