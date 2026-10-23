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

  test("shows the app version in settings", async ({ page }) => {
    const api = await twE2e(page);
    await api.openSettings();
    await expect(page.getByRole("dialog")).toContainText(/Version 0\.0\.0|版本 0\.0\.0/);
  });

  test("locale toggle keeps Home chat collapsed until requested", async ({ page }) => {
    await expect(page.getByTestId("home-work-chat")).toBeHidden();
    await page.getByTestId("locale-switcher-trigger").click();
    await expect(page.getByTestId("locale-switcher-menu")).toBeVisible();
    await page.getByTestId("locale-option-zh-CN").click();
    await expect(page.getByTestId("home-local-chat")).toBeVisible();
    await expect(page.getByTestId("home-work-chat")).toBeHidden();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await page.getByTestId("ai-engineer-tool").click();
    await expect(page.getByTestId("home-work-chat")).toBeVisible();
  });
});
