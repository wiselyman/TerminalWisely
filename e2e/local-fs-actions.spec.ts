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

  test("shows find tab and process manager from dock", async ({ page }) => {
    const files = page.getByTestId("host-file-manager-panel");
    await expect(files).toBeVisible();
    await expect(page.getByTestId("file-manager-search")).toBeVisible();
    await page.getByTestId("file-manager-search").fill("*.log");
    await page.getByTestId("file-manager-search").press("Enter");
    await expect(page.getByTestId("local-fs-contents")).toBeVisible();

    // File-manager float covers the panel dock; minimize first (same as host-desktop e2e).
    await page.getByTestId("host-file-manager-minimize").click();
    await expect(files).toHaveCount(0);
    await page.getByTestId("dock-app-processes").click();
    await expect(page.getByTestId("host-process-manager-panel")).toBeVisible();
    await expect(
      page.getByTestId("host-process-manager-filter"),
    ).toBeVisible();
  });

  test("kill process invokes backend", async ({ page }) => {
    const api = await twE2e(page);
    await api.invokeKillProcess(1001);
    const killed = await api.getLastKillProcess();
    expect(killed?.pid).toBe(1001);
  });
});
