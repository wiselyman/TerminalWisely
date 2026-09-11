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
    await page.getByTestId("locale-switcher-trigger").click();
    await expect(page.getByTestId("locale-switcher-menu")).toBeVisible();
    await page.getByTestId("locale-option-zh-CN").click();
    await expect(page.getByTestId("workspace-welcome")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  });
});
