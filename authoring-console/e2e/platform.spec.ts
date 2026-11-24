import { expect, test } from "@playwright/test";
import { openLauncher } from "./connection";

test("an admin can open platform setup and switch between both setup paths", async ({ page }) => {
  await page.route("**/api/k8s/list", route => route.fulfill({ json: { items: [], metadata: {} } }));
  await page.route("**/api/k8s/write", route => {
    const { object, dryRun } = route.request().postDataJSON();
    if (object.kind === "ClusterLogicPlatform" && dryRun) {
      return route.fulfill({ json: object });
    }
    expect(object.kind).toBe("SelfSubjectAccessReview");
    return route.fulfill({ json: { status: { allowed: true } } });
  });
  await openLauncher(page, "/platform");
  await page.getByRole("button", { name: "Set up platform" }).click();
  const review = page.getByRole("button", { name: "Review", exact: true });
  await expect(review).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "Gateway", exact: true }).click();
  await page.getByRole("button", { name: "Target namespace", exact: true }).click();
  await expect(review).toBeInViewport({ ratio: 1 });
  await page.getByRole("tab", { name: "Create new" }).click();
  await expect(page.getByRole("button", { name: "Create namespace" })).toBeVisible();
  await page.getByRole("tab", { name: "Select existing" }).click();
  await page.getByLabel("Existing namespace").fill("default");
  const next = page.getByRole("button", { name: "Next", exact: true });
  await next.click();
  await page.getByLabel("Quick run without history").check();
  await next.click();
  await expect(page.getByLabel("Enable external gateway access")).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByLabel("Run a workflow and see its history").check();
  await next.click();
  await page.getByRole("textbox", { name: "PostgreSQL Secret name" }).fill("pg-user");
  await page.getByRole("textbox", { name: "Service name", exact: true }).fill("postgres");
  await expect(page.getByRole("textbox", { name: "Database name" })).toHaveValue("logicflow");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  const admission = page.waitForRequest(request =>
    request.url().endsWith("/api/k8s/write") && request.postDataJSON().dryRun === true);
  await page.getByRole("button", { name: "Dry Run", exact: true }).click();
  expect((await admission).postDataJSON().object.spec.dataIndex.persistence.postgresql.serviceRef)
    .toMatchObject({ name: "postgres", databaseName: "logicflow", databaseSchema: "data_index" });
});
