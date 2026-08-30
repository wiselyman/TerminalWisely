import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("Tab management", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await api.openSecondSshTab();
  });

  test("switches between SSH tabs", async ({ page }) => {
    await page.locator('.tab[data-session-id="e2e-ssh-session-1"]').click();
    await expect(page.locator('[data-testid="terminal-view"].active')).toContainText(/e2e@127.0.0.1/);

    await page.locator('.tab[data-session-id="e2e-ssh-session-2"]').click();
    await expect(page.locator(".mgmt-workbench-title h2")).toContainText(/e2e2@127.0.0.1/);
  });

  test("closes a tab via close button", async ({ page }) => {
    await page.locator('.tab[data-session-id="e2e-ssh-session-2"] .tab-close').click();
    await expect(page.locator('.tab[data-session-id="e2e-ssh-session-2"]')).toHaveCount(0);
    await expect(page.locator('.tab[data-session-id="e2e-ssh-session-1"]')).toBeVisible();
  });
});
