import { expect, test } from "@playwright/test";
import { openLauncher } from "./connection";

const datastore = (schema: string) => ({
  postgresql: { secretRef: { name: "pg-user" }, serviceRef: { name: "postgres", databaseName: "workflows", databaseSchema: schema } },
});
const platform = {
  apiVersion: "logic.kubesmarts.org/v1", kind: "ClusterLogicPlatform",
  metadata: { name: "primary", resourceVersion: "12" },
  spec: { targetNamespace: "default", dataIndex: { persistence: datastore("data_index") }, runtime: { persistence: { runtime: datastore("flow_state"), quartz: datastore("timers") } } },
};
test("platform and runtime edits display their existing persistence configuration", async ({page}) => {
  const runtime = { metadata: { name: "orders", namespace: "default", resourceVersion: "14" }, spec: { persistenceMode: "Ephemeral" } };
  await page.route("**/api/k8s/list", route => {
    const kind = route.request().postDataJSON().gvk.kind;
    return route.fulfill({json: {metadata:{}, items: kind === "ClusterLogicPlatform" ? [platform] : kind === "LogicFlowRuntime" ? [runtime] : []}});
  });
  await page.route("**/api/k8s/write", route => {
    const { object, dryRun } = route.request().postDataJSON();
    return route.fulfill({ json: dryRun ? object : { status: { allowed: true } } });
  });
  await openLauncher(page, "/platform");
  await page.getByRole("button", {name:"Edit platform"}).click();
  await page.getByRole("button", { name: /Runtime persistence/ }).click();
  await expect(page.getByLabel("Database schema", {exact:true}).first()).toHaveValue("flow_state");
  await expect(page.getByLabel("Database schema", {exact:true}).last()).toHaveValue("timers");
  await page.getByLabel("Database name", {exact:true}).first().fill("runtime_catalog");
  await page.getByLabel("Database name", {exact:true}).last().fill("scheduler_catalog");
  await page.getByRole("button", {name: /Data Index/}).click();
  await page.getByRole("textbox", {name:"Database name", exact:true}).fill("history_catalog");
  await page.getByRole("button", {name: /Review/}).click();
  const admission = page.waitForRequest(request =>
    request.url().endsWith("/api/k8s/write") && request.postDataJSON().dryRun === true);
  await page.getByRole("button", {name: "Dry Run", exact:true}).click();
  const candidate = (await admission).postDataJSON().object.spec;
  expect(candidate.runtime.persistence.runtime.postgresql.serviceRef.databaseName).toBe("runtime_catalog");
  expect(candidate.runtime.persistence.quartz.postgresql.serviceRef.databaseName).toBe("scheduler_catalog");
  expect(candidate.dataIndex.persistence.postgresql.serviceRef.databaseName).toBe("history_catalog");
  await page.getByRole("link",{name:"Runtimes",exact:true}).click();
  await page.getByRole("button",{name:"Edit persistence"}).click();
  await page.getByLabel("PlatformDB (persistent storage)").check();
  await expect(page.getByText("Linked platform: primary")).toBeVisible();
  await expect(page.getByText("Runtime schema: flow_state")).toBeVisible();
  await expect(page.getByText("Quartz schema: timers")).toBeVisible();
});
