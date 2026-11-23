import { expect, test } from "@playwright/test";
import { openLauncher } from "./connection";

test("an admin can open platform setup and switch between both setup paths", async ({ page }) => {
  await page.route("**/api/k8s/list", route => route.fulfill({ json: { items: [], metadata: {} } }));
  await page.route("**/api/k8s/write", route => {
    expect(route.request().postDataJSON().object.kind).toBe("SelfSubjectAccessReview");
    return route.fulfill({ json: { status: { allowed: true } } });
  });
  await openLauncher(page, "/platform");
  await page.getByRole("button", { name: "Set up platform" }).click();
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
  await expect(page.getByLabel("PostgreSQL Secret name")).toBeVisible();
});
