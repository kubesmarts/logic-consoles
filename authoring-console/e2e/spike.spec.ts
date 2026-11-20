import { expect, test } from "@playwright/test";

/**
 * Gate-zero proof: load the real built app in Chromium and assert the PatternFly
 * shell, the Monaco YAML editor, the CNCF diagram editor and the React Flow canvas all
 * render together, in BOTH light and dark themes, with working keyboard focus.
 */
test("the full dependency stack renders together in light and dark", async ({ page }) => {
  await page.goto("/#/spike");

  // PatternFly shell frame.
  await expect(page.getByRole("link", { name: "Authoring Console" })).toBeVisible();

  // Monaco YAML editor.
  await expect(page.locator(".monaco-editor").first()).toBeVisible({ timeout: 30_000 });

  // CNCF diagram editor mounted its own React Flow renderer inside the preview.
  await expect(page.getByTestId("diagram-preview").locator(".react-flow")).toBeVisible({ timeout: 30_000 });

  // The topology React Flow canvas.
  await expect(page.getByTestId("topology-canvas").locator(".react-flow")).toBeVisible();

  // Light theme by default.
  await expect(page.locator("html")).not.toHaveClass(/pf-v6-theme-dark/);

  // Keyboard focus reaches an interactive control.
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();

  // Switch to dark theme; everything stays rendered.
  await page.getByRole("button", { name: /dark theme/i }).click();
  await expect(page.locator("html")).toHaveClass(/pf-v6-theme-dark/);
  await expect(page.locator(".monaco-editor").first()).toBeVisible();
  await expect(page.getByTestId("topology-canvas").locator(".react-flow")).toBeVisible();
  await expect(page.getByTestId("diagram-preview").locator(".react-flow")).toBeVisible();
});
