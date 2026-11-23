import { expect, test } from "@playwright/test";
import { openLauncher, resources } from "./connection";

test("a hosted session connects directly to Kubernetes and disconnects without persisting its token", async ({
  page,
}) => {
  await page.route("**/api/session", (route) => route.fulfill({ status: 404 }));
  await page.route("https://cluster.example/**", async (route) => {
    expect(route.request().headers().authorization).toBe(
      "Bearer browser-test-token",
    );
    await route.fulfill({ json: { resources } });
  });
  await page.goto("/#/compatibility");
  await page.getByLabel("Kubernetes API URL").fill("https://cluster.example");
  await page.getByLabel("Kubernetes bearer token").fill("browser-test-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(
    page.getByText("No gateway configured", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open console" }).click();
  await expect(
    page.getByRole("heading", { name: "Compatibility", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Active cluster context" }).click();
  await page
    .getByRole("button", { name: "Disconnect and change connection" })
    .click();
  await expect(page.getByLabel("Kubernetes bearer token")).toHaveValue("");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "browser-test-token",
  );
});

test("a saved draft retains its identity when its author opens Publish", async ({
  page,
}) => {
  await page.route("**/api/k8s/list", (route) =>
    route.fulfill({ json: { items: [], metadata: {} } }),
  );
  await page.route("**/api/gateway/definitions", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.addInitScript(() => {
    const workflowYaml =
      "document:\n  dsl: '1.0.0'\n  namespace: default\n  name: saved-example\n  version: '2.0.0'\ndo: []\n";
    localStorage.setItem(
      "authoring-console:v1",
      JSON.stringify({
        schemaVersion: 1,
        preferences: { theme: "light" },
        drafts: [
          {
            id: "saved",
            title: "Saved example",
            workflowYaml,
            target: { contextName: "kind-demo", namespace: "default" },
          },
        ],
      }),
    );
  });
  await openLauncher(page, "/authoring/saved");
  await page.getByRole("button", { name: "Publish workflow" }).click();
  await expect(page.getByText("Workflow: saved-example @ 2.0.0")).toBeVisible();
});
