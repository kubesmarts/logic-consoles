import { expect, test } from "@playwright/test";
import { openLauncher } from "./connection";
import { catalogFixture } from "../src/fixtures/catalog";
import { definitionFixtures } from "../src/fixtures/kubernetes";

test("review the workflow resource list and version details", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/gateway/definitions", route => route.fulfill({ json: catalogFixture }));
  await page.route("**/api/k8s/list", route => route.fulfill({
    json: { items: route.request().postDataJSON().gvk.kind === "LogicFlowDefinition" ? definitionFixtures : [] },
  }));
  await openLauncher(page, "/workflows");
  const filter = page.getByRole("textbox", { name: "Filter workflows by name" });
  await filter.fill("PAY");
  await expect(page.getByRole("gridcell", { name: "payments" })).toBeVisible();
  await expect(page.getByRole("gridcell", { name: "hello-world" })).toHaveCount(0);
  await filter.fill("unknown");
  await page.getByRole("button", { name: "Clear filter", exact: true }).click();
  await page.getByRole("row").filter({ hasText: "hello-world" }).getByRole("button").click();
  const version = page.getByRole("button", { name: "1.1.0" });
  await expect(version).toBeVisible();
  if (process.env.DESIGN_CAPTURE === "after") await page.screenshot({ path: `docs/design/workflows-after.png` });
  await version.click();
  await expect(page.getByTestId("cr-name")).toContainText("hello-world-v-1-1-0");
  if (process.env.DESIGN_CAPTURE === "after") await page.screenshot({ path: `docs/design/version-after.png` });
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Workflow details" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run this version" })).toBeInViewport();
  const columns = page.getByRole("tabpanel", { name: "Details" }).locator("dl");
  const identity = await columns.first().boundingBox();
  const binding = await columns.last().boundingBox();
  expect(binding!.y).toBeGreaterThanOrEqual(identity!.y + identity!.height);
});
