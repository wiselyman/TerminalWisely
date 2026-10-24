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

  test("file list shows Linux permissions, ownership, and modified time", async ({ page }) => {
    const panel = page.getByTestId("host-file-manager-panel");
    await expect(panel.getByText("Permissions")).toBeVisible();
    await expect(panel.getByText("Owner")).toBeVisible();
    await expect(panel.getByText("Group")).toBeVisible();
    await expect(panel.getByText("Modified")).toBeVisible();
    const row = panel.locator('[data-path="/var/log/app.log"]');
    await expect(row).toContainText("-rw-r-----");
    await expect(row).toContainText("ubuntu");
    await expect(row).toContainText("adm");
    await expect(row).toContainText("Oct 24, 2024");

    await panel.getByRole("button", { name: "Icon view" }).click();
    await expect(panel.locator('[data-path="/var/log/app.log"]')).toContainText(
      "-rw-r----- · ubuntu:adm · 4.0 KB",
    );
  });

  test("file actions remain available from Desktop", async ({ page }) => {
    const panel = page.getByTestId("host-file-manager-panel");
    const row = panel.locator('[data-path="/var/log/app.log"]');
    await row.click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Remote file actions" });
    await expect(menu.getByRole("menuitem", { name: "Download file" })).toBeVisible({ timeout: 1_000 });
    await expect(menu.getByRole("menuitem", { name: "Edit & preview" })).toBeVisible({ timeout: 1_000 });
    await expect(menu.getByRole("menuitem", { name: "Send to chat" })).toBeVisible({ timeout: 1_000 });
    await expect(menu.getByRole("menuitem", { name: "Send to another server" })).toBeVisible({ timeout: 1_000 });
    await expect(menu.getByRole("menuitem", { name: "Rename" })).toBeVisible({ timeout: 1_000 });
    await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeVisible({ timeout: 1_000 });
    await expect(menu.getByRole("menuitem", { name: "Move to directory" })).toBeVisible({ timeout: 1_000 });
    await page.keyboard.press("Escape");
    await panel.locator('[data-testid="local-fs-contents"]').click({ button: "right", position: { x: 20, y: 20 } });
    await expect(page.getByRole("menuitem", { name: "Upload" })).toBeVisible({ timeout: 1_000 });
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
