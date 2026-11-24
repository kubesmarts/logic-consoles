import { expect, test } from "@playwright/test";
import { openLauncher } from "./connection";

test("runtime dialogs keep controls visible and offer expandable YAML metadata", async ({ page }) => {
  const runtime = {
    apiVersion: "logic.kubesmarts.org/v1", kind: "LogicFlowRuntime",
    metadata: {
      name: "orders", namespace: "default", resourceVersion: "47",
      managedFields: [{ manager: "kube-controller-manager", operation: "Update" }],
    },
    spec: { persistenceMode: "Ephemeral" },
  };
  await page.route("**/api/k8s/list", route => route.fulfill({
    json: { items: route.request().postDataJSON().gvk.kind === "LogicFlowRuntime" ? [runtime] : [] },
  }));
  await page.route("**/api/k8s/write", route => route.fulfill({ json: { status: { allowed: true } } }));
  await openLauncher(page, "/runtimes");

  await page.getByRole("button", { name: "Details", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Runtime details.*orders/ })).toBeVisible();
  const details = await dialog.locator("dl").boundingBox();
  const bounds = await dialog.boundingBox();
  expect(details!.x).toBeGreaterThan(bounds!.x);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "YAML", exact: true }).click();
  const lines = dialog.locator(".view-lines");
  await expect(lines).toContainText("managedFields:");
  await expect(lines).toContainText("Ephemeral");
  await expect(lines).not.toContainText("kube-controller-manager");
  await dialog.locator(".codicon-folding-collapsed").click();
  await expect(lines).toContainText("kube-controller-manager");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "Edit persistence" }).click();
  await dialog.getByRole("button", { name: /Review and submit/ }).click();
  await expect(dialog.getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Dry Run", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Next", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
