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
    await expect(page.getByTestId("dock-app-terminal")).toBeVisible();
    await expect(page.getByTestId("dock-app-ai-linux")).toBeVisible();
    await expect(page.locator(".app-shell.desktop-mode")).toBeVisible();
    await expect(page.getByTestId("host-desktop-empty")).toBeVisible();

    const panelBox = await page.getByTestId("host-desktop-panel").boundingBox();
    const termBox = await page
      .locator(".terminal-stack [data-testid='terminal-view'].active")
      .boundingBox();
    const sideBox = await page.locator(".sidebar").boundingBox();
    expect(panelBox).toBeTruthy();
    expect(termBox).toBeTruthy();
    expect(sideBox).toBeTruthy();
    expect(panelBox!.x).toBeGreaterThanOrEqual(sideBox!.x + sideBox!.width - 2);
    expect(panelBox!.x).toBeLessThanOrEqual(termBox!.x + 1);
    expect(panelBox!.x + panelBox!.width).toBeGreaterThanOrEqual(
      termBox!.x + termBox!.width - 1,
    );
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
    await expect(page.getByTestId("host-file-manager-float")).toBeVisible();
    await expect(
      page.getByTestId("host-desktop-surface").getByTestId("host-file-manager-panel"),
    ).toBeVisible();

    await page.getByTestId("host-file-manager-maximize").click();
    await expect(files).toHaveAttribute("data-maximized", "true");
    const panelBox = await page.getByTestId("host-desktop-panel").boundingBox();
    const filesBox = await files.boundingBox();
    const sideBox = await page.locator(".sidebar").boundingBox();
    expect(panelBox && filesBox && sideBox).toBeTruthy();
    expect(filesBox!.x).toBeGreaterThanOrEqual(sideBox!.x + sideBox!.width - 2);
    expect(filesBox!.x + filesBox!.width).toBeLessThanOrEqual(
      panelBox!.x + panelBox!.width + 2,
    );

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

  test("Terminal and AI Linux reuse the session and exit restores the terminal", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1680, height: 1100 });
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();
    await page.getByTestId("local-fs-tool").click();

    await page.getByTestId("dock-app-terminal").click();
    const surface = page.getByTestId("host-desktop-surface");
    const terminalFloat = page.getByTestId("host-terminal-float");
    await expect(surface.locator("[data-testid='terminal-view'].active")).toBeVisible();
    await expect(surface.locator(".xterm")).toBeVisible();
    const termHost = surface.locator(".tw-terminal-host");
    const termHostBox = await termHost.boundingBox();
    expect(termHostBox && termHostBox.height).toBeGreaterThan(80);
    await expect(page.getByTestId("terminal-view")).toHaveCount(1);

    const beforeDrag = await terminalFloat.boundingBox();
    expect(beforeDrag).toBeTruthy();
    await page.mouse.move(beforeDrag!.x + 48, beforeDrag!.y + 14);
    await page.mouse.down();
    await page.mouse.move(beforeDrag!.x + 110, beforeDrag!.y + 64, { steps: 8 });
    await page.mouse.up();
    const afterDrag = await terminalFloat.boundingBox();
    expect(afterDrag!.x).toBeGreaterThan(beforeDrag!.x + 40);
    expect(afterDrag!.y).toBeGreaterThan(beforeDrag!.y + 30);

    const beforeResize = afterDrag!;
    const handle = terminalFloat.getByTestId("desktop-window-resize-se");
    const handleBox = await handle.boundingBox();
    expect(handleBox).toBeTruthy();
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2,
      handleBox!.y + handleBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(handleBox!.x + 70, handleBox!.y + 50, { steps: 8 });
    await page.mouse.up();
    const afterResize = await terminalFloat.boundingBox();
    expect(afterResize!.width).toBeGreaterThan(beforeResize.width + 30);
    expect(afterResize!.height).toBeGreaterThan(beforeResize.height + 20);

    await page.getByTestId("host-terminal-maximize").click();
    const dockBox = await page.getByTestId("host-desktop-dock").boundingBox();
    const maxBox = await page.getByTestId("host-terminal-panel").boundingBox();
    expect(dockBox && maxBox).toBeTruthy();
    expect(maxBox!.y + maxBox!.height).toBeLessThanOrEqual(dockBox!.y + 2);
    await page.getByTestId("host-terminal-maximize").click();

    await page.getByTestId("host-terminal-minimize").click();
    await expect(page.locator(".terminal-stack [data-testid='terminal-view']")).toHaveCount(1);
    await expect(surface.locator("[data-testid='terminal-view']")).toHaveCount(0);

    await page.getByTestId("dock-app-ai-linux").click();
    await expect(surface.locator(".ai-engineer-panel.is-desktop-embed")).toBeVisible();
    await expect(page.locator(".ai-engineer-panel.is-desktop-embed")).toHaveCount(1);
    await expect(surface.getByTestId("ai-engineer-composer")).toBeVisible({
      timeout: 20_000,
    });

    await page.getByTestId("host-ai-linux-close").click();
    await expect(surface.locator(".ai-engineer-panel.is-desktop-embed")).toHaveCount(0);
    await page.getByTestId("ai-engineer-tool").click();
    await expect(page.getByTestId("host-desktop-panel")).toHaveCount(0);
    await expect(page.locator(".app-shell.desktop-mode")).toHaveCount(0);
    await expect(
      page.locator(".terminal-stack [data-testid='terminal-view'].active"),
    ).toBeVisible();
    await expect(
      page.locator(".ai-engineer-panel:not(.ai-engineer-panel-parked)"),
    ).toBeVisible();
  });

  test("new host dialog stays above the desktop", async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();
    await page.getByTestId("local-fs-tool").click();
    await expect(page.getByTestId("host-desktop-panel")).toBeVisible();
    await page.getByTestId("entity-add-item-hosts").click();
    const dialog = page.getByTestId("ssh-host-group");
    await expect(dialog).toBeVisible();
    const above = await page.evaluate(() => {
      const modal = document.querySelector(".modal-backdrop");
      const desktop = document.querySelector("[data-testid='host-desktop-panel']");
      if (!modal || !desktop) return false;
      const modalZ = Number(getComputedStyle(modal).zIndex);
      const desktopZ = Number(getComputedStyle(desktop).zIndex);
      return modalZ > desktopZ;
    });
    expect(above).toBe(true);
  });

  test("desktop windows stay after leaving and returning", async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();
    await page.getByTestId("local-fs-tool").click();
    await page.getByTestId("dock-app-processes").click();
    const panel = page.getByTestId("host-process-manager-panel");
    await expect(panel).toBeVisible();

    const glyph = await page
      .locator("[data-testid='dock-app-processes'] .host-desktop-glyph")
      .boundingBox();
    const dot = await page
      .locator("[data-testid='dock-app-processes'] .host-desktop-dock-dot")
      .boundingBox();
    expect(glyph).toBeTruthy();
    expect(dot).toBeTruthy();
    expect(dot!.y).toBeGreaterThan(glyph!.y + glyph!.height - 1);

    const head = await panel.locator(".desktop-app-window-head").boundingBox();
    const close = await page.getByTestId("host-process-manager-close").boundingBox();
    expect(head).toBeTruthy();
    expect(close).toBeTruthy();
    expect(close!.height).toBeLessThanOrEqual(20);
    expect(close!.height).toBeLessThan(head!.height);

    await page.getByTestId("local-fs-tool").click();
    await expect(page.getByTestId("host-desktop-panel")).toHaveCount(0);
    await page.getByTestId("local-fs-tool").click();
    await expect(page.getByTestId("host-process-manager-panel")).toBeVisible();
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
