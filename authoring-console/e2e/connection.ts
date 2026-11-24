import { expect, type Page } from "@playwright/test";

export const resources = [
  "ClusterLogicPlatform",
  "LogicFlowRuntime",
  "LogicFlowDefinition",
  "LogicFlowService",
].map((kind) => ({ kind, name: kind.toLowerCase() + "s" }));

export async function openLauncher(page: Page, path: string) {
  const session = {
    mode: "launcher",
    sessionId: "initial",
    context: { contextName: "kind-demo", clusterDisplay: "kind" },
    namespace: null,
    gatewayUrl: null,
  };
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: session }),
  );
  await page.route("**/api/contexts", (route) =>
    route.fulfill({ json: [{ name: "kind-demo" }] }),
  );
  await page.route("**/api/connect", async (route) => {
    expect(route.request().headers()["x-session-id"]).toBe("initial");
    expect(route.request().postDataJSON()).toEqual({
      contextName: "kind-demo",
      gatewayUrl: null,
    });
    await route.fulfill({ json: { ...session, sessionId: "confirmed" } });
  });
  await page.route("**/api/discovery", async (route) => {
    expect(route.request().headers()["x-session-id"]).toBe("confirmed");
    await route.fulfill({ json: { resources } });
  });
  await page.goto("/#" + path);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "Open console" }).click();
}
