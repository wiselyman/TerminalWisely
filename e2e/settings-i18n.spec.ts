import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("Settings and locale", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openHome();
  });

  test("opens settings dialog", async ({ page }) => {
    const api = await twE2e(page);
    await api.openSettings();
    await expect(page.locator(".app-settings-dialog, [role='dialog']")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("locale toggle updates welcome text", async ({ page }) => {
    await page.getByRole("button", { name: /Language|语言/i }).click();
    await page.getByRole("menuitemradio", { name: /中文/i }).click();
    await expect(page.getByTestId("workspace-welcome")).toBeVisible();
  });
});
