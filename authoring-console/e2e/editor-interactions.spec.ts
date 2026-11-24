import { expect, test } from "@playwright/test";
import { openLauncher } from "./connection";

test("chooses an example with the keyboard and drags its visible diagram nodes", async ({
  page,
}) => {
  await openLauncher(page, "/authoring");
  await page.getByRole("button", { name: "Start from example" }).click();
  const choose = page.getByRole("button", { name: "Use Hello World" });
  const border = () =>
    choose.evaluate((el) => getComputedStyle(el, "::before").borderTopColor);
  const normalBorder = await border();
  await choose.hover();
  await expect.poll(border).not.toBe(normalBorder);
  await choose.focus();
  await choose.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const preview = page.getByTestId("diagram-preview");
  const node = preview.locator(".react-flow__node.draggable").first();
  await expect(node).toBeInViewport();
  const pos = await node.boundingBox();
  if (!pos) throw new Error("Diagram node has no layout");
  const transform = await node.evaluate((el) => el.style.transform);
  const x = pos.x + pos.width / 2;
  const y = pos.y + pos.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y + 30, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(() => node.evaluate((el) => el.style.transform))
    .not.toBe(transform);

  const viewport = preview.locator(".react-flow__viewport");
  const pan = await viewport.evaluate((el) => el.style.transform);
  const pane = await preview.locator(".react-flow__pane").boundingBox();
  if (!pane) throw new Error("Diagram pane has no layout");
  await page.mouse.move(pane.x + 12, pane.y + 12);
  await page.mouse.down();
  await page.mouse.move(pane.x + 52, pane.y + 32, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() => viewport.evaluate((el) => el.style.transform))
    .not.toBe(pan);
});

test("topology edges terminate in visible directional markers", async ({
  page,
}) => {
  await openLauncher(page, "/spike");
  await expect(
    page
      .getByTestId("topology-canvas")
      .locator(".react-flow__edge-path[marker-end]")
      .first(),
  ).toBeVisible();
});

test("opens the deployed version's diagram from Workflows and fits it on each visit", async ({ page }) => {
  const document = { dsl: "1.1.0", namespace: "default", name: "orders", version: "2.0.0" };
  await page.route("**/api/k8s/list", route => route.fulfill({ json: { items: [] } }));
  await page.route("**/api/gateway/definitions", route => route.fulfill({ json: [document] }));
  await page.route("**/api/gateway/definition/default/orders/2.0.0", route =>
    route.fulfill({ json: { document, do: [{ acknowledgeOrder: { set: { accepted: true } } }] } }));

  await openLauncher(page, "/workflows");
  await page.getByRole("row").filter({ hasText: "orders" }).getByRole("button").click();
  await page.getByRole("button", { name: "2.0.0" }).click();
  const preview = page.getByTestId("diagram-preview");
  const task = preview.locator(".react-flow__node").filter({ hasText: "acknowledgeOrder" });
  for (let visit = 0; visit < 2; visit++) {
    await expect(page.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    await expect(preview).toHaveCount(0);
    await page.getByRole("tab", { name: "Diagram" }).click();
    await expect(task).toBeInViewport();
    await page.getByRole("tab", { name: "Details" }).click();
  }
});
