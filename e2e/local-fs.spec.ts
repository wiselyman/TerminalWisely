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

  test("Linux file metadata stays in list view and icon view shows filenames only", async ({ page }) => {
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
    const card = panel.locator('[data-path="/var/log/app.log"]');
    await expect(card).toContainText("app.log");
    await expect(card.locator(".local-fs-grid-meta")).toHaveCount(0);
    await expect(card).not.toContainText("-rw-r-----");
    await expect(card).not.toContainText("ubuntu");
    await expect(card).not.toContainText("4.0 KB");
    await expect(card).not.toContainText("Oct 24, 2024");
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
    const locateButton = panel.getByRole("button", { name: "Current directory" });
    expect(await locateButton.count()).toBe(0);
    await expect(panel.getByRole("button", { name: "Refresh" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Show hidden files" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "List view" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Icon view" })).toBeVisible();
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
