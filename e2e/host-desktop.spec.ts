import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("Host desktop mode", () => {
  test("Host tool opens desktop side panel with dock", async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();
    await page.getByTestId("local-fs-tool").click();
    await expect(page.getByTestId("host-desktop-panel")).toBeVisible();
    await expect(page.getByTestId("host-desktop-surface")).toBeVisible();
    await expect(page.getByTestId("host-desktop-dock")).toBeVisible();
    await expect(page.getByTestId("dock-app-files")).toBeVisible();
    await expect(page.getByTestId("dock-app-processes")).toBeVisible();
    await expect(page.getByTestId("dock-app-browser")).toBeVisible();
    await expect(page.getByTestId("host-desktop-empty")).toBeVisible();
  });

  test("dock apps open as Markdown-style floats over the desktop", async ({
    page,
  }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();
    await page.getByTestId("local-fs-tool").click();

    await page.getByTestId("dock-app-files").click();
    const files = page.getByTestId("host-file-manager-panel");
    await expect(files).toBeVisible();
    await expect(files).toHaveAttribute("data-maximized", "false");
    // Like Markdown preview: float is portaled to body with backdrop, not inset in surface.
    await expect(page.getByTestId("host-file-manager-float")).toBeVisible();
    await expect(
      page.getByTestId("host-desktop-surface").getByTestId("host-file-manager-panel"),
    ).toHaveCount(0);

    await page.getByTestId("host-file-manager-maximize").click();
    await expect(files).toHaveAttribute("data-maximized", "true");
    await expect(page.getByTestId("host-file-manager-float")).toBeVisible();

    await page.getByTestId("host-file-manager-maximize").click();
    await expect(files).toHaveAttribute("data-maximized", "false");

    await page.getByTestId("host-file-manager-minimize").click();
    await expect(files).toHaveCount(0);
    await page.getByTestId("dock-app-files").click();
    await expect(files).toBeVisible();
    await page.getByTestId("host-file-manager-close").click();
    await expect(files).toHaveCount(0);

    await page.getByTestId("dock-app-processes").click();
    await expect(page.getByTestId("host-process-manager-panel")).toBeVisible();
    await expect(page.getByTestId("host-process-manager-float")).toBeVisible();
    await page.getByTestId("host-process-manager-minimize").click();
    await expect(page.getByTestId("host-process-manager-panel")).toHaveCount(0);

    await page.getByTestId("dock-app-browser").click();
    await expect(page.getByTestId("host-browser-panel")).toBeVisible();
    await expect(page.getByTestId("host-browser-float")).toBeVisible();
    await expect(page.getByTestId("host-browser-panel")).toHaveAttribute(
      "data-chrome",
      "icon-title",
    );
    await expect(page.getByTestId("desktop-app-window-leading")).toBeVisible();
    await page.getByTestId("host-browser-minimize").click();
    await expect(page.getByTestId("host-browser-panel")).toHaveCount(0);
    await expect(page.getByTestId("host-desktop-dock")).toBeVisible();
  });

  test("Cmd/Ctrl+F opens desktop file manager search", async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();

    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+KeyF`);

    await expect(page.getByTestId("host-desktop-panel")).toBeVisible();
    await expect(page.getByTestId("host-file-manager-panel")).toBeVisible();
    await expect(page.getByTestId("file-manager-search")).toBeFocused();
  });
});
