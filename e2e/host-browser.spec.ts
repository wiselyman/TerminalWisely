import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("Host browser (SOCKS panel)", () => {
  test("globe tool disabled on Home without SSH", async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openHome();
    const tool = page.getByTestId("host-browser-tool");
    // Tool only mounts on hosts sidebar with session chrome; on home it may be absent or disabled.
    if (await tool.count()) {
      await expect(tool).toBeDisabled();
    } else {
      await expect(page.getByTestId("workspace-welcome")).toBeVisible();
    }
  });

  test("opens browser panel with mock SSH session", async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();
    await api.openBrowserPanel();
    await expect(page.getByTestId("host-browser-panel")).toBeVisible();
    await expect(page.getByTestId("host-browser-url")).toBeVisible();
    await page.getByTestId("host-browser-url").fill("http://127.0.0.1:8080/");
    await page.getByTestId("host-browser-url").press("Enter");
    await expect(page.getByTestId("host-browser-url")).toHaveValue(
      "http://127.0.0.1:8080/",
    );
    // Progress track is always mounted; becomes active while loading.
    await expect(page.getByTestId("host-browser-progress")).toBeAttached();
  });

  test("compact chrome with globe, library, favicon, dock restore", async ({
    page,
  }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();
    await api.openBrowserPanel();
    await expect(page.getByTestId("host-browser-panel")).toBeVisible();
    await expect(page.getByTestId("host-browser-panel")).toHaveAttribute(
      "data-chrome",
      "icon-title",
    );
    await expect(page.getByTestId("desktop-app-window-leading")).toBeVisible();
    await expect(page.getByTestId("host-browser-back")).toBeVisible();
    await expect(page.getByTestId("host-browser-forward")).toBeVisible();
    await expect(page.getByTestId("host-browser-reload")).toBeVisible();
    await expect(page.getByTestId("host-browser-library-toggle")).toBeVisible();
    await expect(page.getByTestId("host-browser-content")).toBeVisible();
    await expect(page.getByTestId("host-browser-tab-favicon")).toBeAttached();
    await page.getByTestId("host-browser-url").fill("127.0.0.1");
    await expect(page.getByTestId("host-browser-suggest")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("host-browser-library-toggle").click();
    await expect(page.getByTestId("host-browser-library")).toBeVisible();
    await expect(page.getByTestId("host-browser-star")).toBeVisible();
    await expect(page.getByTestId("host-browser-bookmarks")).toBeVisible();
    await expect(page.getByTestId("host-browser-history")).toBeVisible();
    await page.getByTestId("host-browser-tab-new").click();
    await expect(page.getByTestId("host-browser-tab")).toHaveCount(2);
    await page.getByTestId("host-browser-minimize").click();
    await expect(page.getByTestId("host-browser-panel")).toHaveCount(0);
    await expect(page.getByTestId("host-desktop-dock")).toBeVisible();
    await expect(page.getByTestId("dock-app-browser")).toHaveAttribute(
      "data-state",
      "minimized",
    );
    await page.getByTestId("dock-app-browser").click();
    await expect(page.getByTestId("host-browser-panel")).toBeVisible();
    await page.getByTestId("host-browser-maximize").click();
    await expect(page.getByTestId("host-browser-panel")).toHaveAttribute(
      "data-maximized",
      "true",
    );
    await page.getByTestId("host-browser-close").click();
    await expect(page.getByTestId("host-browser-panel")).toHaveCount(0);
    await expect(page.getByTestId("dock-app-browser")).toHaveAttribute(
      "data-state",
      "idle",
    );
  });
});
