import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("Local FS panel", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await api.openLocalFsPanel();
  });

  test("opens local fs panel with file tree tabs", async ({ page }) => {
    await expect(page.locator(".local-fs-panel")).toBeVisible({ timeout: 15_000 });
  });

  test("shows find and task manager sub-tabs", async ({ page }) => {
    const panel = page.locator(".local-fs-panel");
    await expect(panel).toBeVisible();
    await panel.getByRole("tab", { name: /Find|查找/i }).click();
    await expect(panel.locator(".find-panel-head")).toBeVisible();
    await panel.getByRole("tab", { name: /Processes|进程/i }).click();
    await expect(panel.locator(".task-manager-toolbar")).toBeVisible();
  });
});
