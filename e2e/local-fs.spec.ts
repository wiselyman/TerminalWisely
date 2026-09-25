import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("Local FS panel", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await api.openLocalFsPanel();
  });

  test("opens desktop + file manager float with file tree", async ({ page }) => {
    await expect(page.getByTestId("host-desktop-panel")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("host-file-manager-panel")).toBeVisible();
    await expect(page.getByTestId("host-file-manager-minimize")).toBeVisible();
    await expect(page.getByTestId("host-file-manager-close")).toBeVisible();
    await expect(page.getByTestId("local-fs-split")).toBeVisible();
  });

  test("file manager has path-bar search and chrome", async ({ page }) => {
    const panel = page.getByTestId("host-file-manager-panel");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("file-manager-search")).toBeVisible();
    await expect(page.getByTestId("local-fs-split")).toBeVisible();
    await expect(page.getByTestId("local-fs-contents")).toBeVisible();
    await expect(page.getByTestId("local-fs-path-breadcrumb")).toBeVisible();
    await expect(page.getByTestId("local-fs-crumb-root")).toBeVisible();

    await page.getByTestId("host-file-manager-minimize").click();
    await expect(panel).toHaveCount(0);
    await page.getByTestId("dock-app-files").click();
    await expect(page.getByTestId("host-file-manager-panel")).toBeVisible();
  });
});
