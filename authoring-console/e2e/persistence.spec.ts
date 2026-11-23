import { expect, test } from "@playwright/test";
import { openLauncher } from "./connection";

const datastore = (schema: string) => ({
  postgresql: { secretRef: { name: "pg-user" }, serviceRef: { name: "postgres", databaseName: "workflows", databaseSchema: schema } },
});
const platform = {
  metadata: { name: "primary", resourceVersion: "12" },
  spec: { targetNamespace: "default", runtime: { persistence: { runtime: datastore("flow_state"), quartz: datastore("timers") } } },
};
test("platform and runtime edits display their existing persistence configuration", async ({page}) => {
  const runtime = { metadata: { name: "orders", namespace: "default", resourceVersion: "14" }, spec: { persistenceMode: "Ephemeral" } };
  await page.route("**/api/k8s/list", route => {
    const kind = route.request().postDataJSON().gvk.kind;
    return route.fulfill({json: {metadata:{}, items: kind === "ClusterLogicPlatform" ? [platform] : kind === "LogicFlowRuntime" ? [runtime] : []}});
  });
  await page.route("**/api/k8s/write", route => route.fulfill({json:{status:{allowed:true}}}));
  await openLauncher(page, "/platform");
  await page.getByRole("button", {name:"Edit platform"}).click();
  await page.getByRole("button", { name: /Runtime persistence/ }).click();
  await expect(page.getByLabel("Database schema", {exact:true}).first()).toHaveValue("flow_state");
  await expect(page.getByLabel("Database schema", {exact:true}).last()).toHaveValue("timers");
  await page.getByRole("link",{name:"Runtimes",exact:true}).click();
  await page.getByRole("button",{name:"Edit persistence"}).click();
  await page.getByLabel("PlatformDB (persistent storage)").check();
  await expect(page.getByText("Linked platform: primary")).toBeVisible();
  await expect(page.getByText("Runtime schema: flow_state")).toBeVisible();
  await expect(page.getByText("Quartz schema: timers")).toBeVisible();
});
