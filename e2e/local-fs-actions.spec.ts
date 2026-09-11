import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("Local FS actions", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openSshTab();
    await api.openLocalFsPanel();
  });

  test("shows find and processes tabs", async ({ page }) => {
    const panel = page.locator(".local-fs-panel");
    await expect(panel).toBeVisible();
    await panel.getByRole("tab", { name: /Find|查找/i }).click();
    await expect(panel.locator(".find-panel-head")).toBeVisible();
    await panel.getByRole("tab", { name: /Processes|进程/i }).click();
    await expect(panel.locator(".task-manager-toolbar")).toBeVisible();
  });

  test("kill process invokes backend", async ({ page }) => {
    const api = await twE2e(page);
    await api.invokeKillProcess(1001);
    const killed = await api.getLastKillProcess();
    expect(killed?.pid).toBe(1001);
  });
});
