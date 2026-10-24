import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("Host desktop mode", () => {
  test("MarkWisely opens from the Desktop Dock", async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();
    await page.getByTestId("local-fs-tool").click();

    const launchButton = page.getByTestId("dock-app-markwisely");
    await expect(launchButton).toBeVisible();
    await launchButton.click();
    await expect(launchButton).toHaveAttribute("data-state", "open");
    await expect(page.getByTestId("markwisely-panel")).toBeVisible();
    await expect(page.getByTestId("markwisely-new-document")).toBeVisible();
    await expect(page.getByTestId("markwisely-open-document")).toBeVisible();
    expect(await page.getByTestId("markwisely-brand-icon").locator("svg").count()).toBe(1);
    expect(await page.getByTestId("markwisely-new-document").locator("svg").count()).toBe(1);
    expect(await page.getByTestId("markwisely-open-document").locator("svg").count()).toBe(1);
    await expect(launchButton.locator(".host-desktop-glyph")).toHaveCSS(
      "background-image",
      /linear-gradient/,
    );

    await page.getByTestId("markwisely-new-document").click();
    const newFolderDialog = page.getByRole("dialog", { name: "Choose folder" });
    await expect(newFolderDialog).toBeVisible();
    await expect(page.getByTestId("markwisely-home")).toBeVisible();
    await expect(newFolderDialog.getByTestId("markwisely-folder-entry").first().locator("svg")).toBeVisible();
    await newFolderDialog.getByTestId("markwisely-folder-entry").filter({ hasText: "logs" }).click();
    await expect(newFolderDialog.locator(".markwisely-picker-path")).toHaveText("/home/e2e/logs");
    await newFolderDialog.getByRole("button", { name: "Use this folder" }).click();
    await expect(page.getByTestId("markwisely-create-view")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Folder" })).toHaveValue("/home/e2e/logs");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("markwisely-home")).toBeVisible();

    await page.getByTestId("markwisely-new-document").click();
    await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("markwisely-home")).toBeVisible();

    await page.getByTestId("markwisely-open-document").click();
    const chooseOpenFolderDialog = page.getByRole("dialog", { name: "Choose folder" });
    await expect(chooseOpenFolderDialog).toBeVisible();
    await chooseOpenFolderDialog.getByTestId("markwisely-folder-entry").filter({ hasText: "logs" }).click();
    await chooseOpenFolderDialog.getByRole("button", { name: "Use this folder" }).click();
    const openDialog = page.getByRole("dialog", { name: "Open Markdown file" });
    expect(await openDialog.count()).toBe(1);
    await expect(openDialog.locator(".markwisely-picker-path")).toHaveText("/home/e2e/logs");
    await expect(page.getByTestId("markwisely-home")).toBeVisible();
    await expect(openDialog).toHaveAttribute("aria-modal", "true");
    await openDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(openDialog).toHaveCount(0);
  });

  test("MarkWisely creates, edits, saves, and reopens a remote Markdown file", async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();
    await page.getByTestId("local-fs-tool").click();
    await page.getByTestId("dock-app-markwisely").click();
    const panel = page.getByTestId("markwisely-panel");
    await page.getByTestId("markwisely-new-document").click();
    await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
    await expect(page.getByTestId("markwisely-create-view")).toBeVisible();
    await expect(panel.getByRole("textbox", { name: /Folder|文件夹/i })).toHaveValue("/home/e2e");
    await page.getByTestId("markwisely-file-name").fill("draft.md");
    await page.getByTestId("markwisely-create-submit").click();
    await expect(panel.locator(".vditor-ir")).toBeVisible({ timeout: 30_000 });

    const editor = panel.locator('.vditor-ir [contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("# Saved from MarkWisely");
    await expect(page.getByTestId("markwisely-save")).toBeEnabled();
    await page.getByTestId("markwisely-save").click();
    await expect(panel.getByRole("status")).toContainText(/Saved|已保存/);
    const saved = await api.getLastPreviewSave();
    expect(saved?.content).toContain("Saved from MarkWisely");

    await panel.getByRole("button", { name: /All files|全部文件/i }).click();
    const recent = panel.getByRole("button", { name: /draft\.md/ });
    await expect(recent).toBeVisible();
    await recent.click();
    await expect(panel.locator(".vditor-ir")).toContainText("UNIQUE_WYSIWYG_MARKER_42", { timeout: 30_000 });
  });

  test("MarkWisely picker filters non-Markdown files and keeps a dirty document when canceling discard", async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();
    await page.getByTestId("local-fs-tool").click();
    await page.getByTestId("dock-app-markwisely").click();
    const panel = page.getByTestId("markwisely-panel");
    await page.getByTestId("markwisely-new-document").click();
    await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
    await page.getByTestId("markwisely-file-name").fill("note.md");
    await page.getByTestId("markwisely-create-submit").click();
    await expect(panel.locator(".vditor-ir")).toBeVisible({ timeout: 30_000 });
    await panel.getByRole("button", { name: /All files|全部文件/i }).click();
    await page.getByTestId("markwisely-open-document").click();
    await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
    await expect(page.getByTestId("markwisely-file-entry")).toContainText("note.md");
    await expect(panel.getByText("app.log")).toHaveCount(0);
    await page.getByTestId("markwisely-file-entry").click();
    await expect(panel.locator(".vditor-ir")).toContainText("UNIQUE_WYSIWYG_MARKER_42", { timeout: 30_000 });

    await panel.getByRole("button", { name: /All files|全部文件/i }).click();
    await page.getByTestId("markwisely-new-document").click();
    const chooseNextFolder = page.getByRole("dialog", { name: "Choose folder" });
    await expect(chooseNextFolder.locator(".markwisely-picker-path")).toHaveText("/home/e2e");
    await chooseNextFolder.getByRole("button", { name: "Cancel" }).click();
    await panel.getByRole("button", { name: /note\.md/ }).click();
    await expect(panel.locator(".vditor-ir")).toContainText("UNIQUE_WYSIWYG_MARKER_42", { timeout: 30_000 });

    const editor = panel.locator('.vditor-ir [contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("unsaved draft");
    await panel.getByRole("button", { name: /All files|全部文件/i }).click();
    const dialog = panel.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /Keep editing|继续编辑/i }).click();
    await expect(panel.getByTestId("markwisely-editor-view")).toBeVisible();
    await expect(editor).toContainText("unsaved draft");
  });

  test("titlebar Chat and Desktop controls switch in one click", async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();

    const chatButton = page.getByTestId("ai-engineer-tool");
    const desktopButton = page.getByTestId("local-fs-tool");
    const actions = page.locator(".chrome-titlebar-actions");
    await expect(actions).toHaveCSS("-webkit-app-region", "no-drag");
    await expect(chatButton).toHaveCSS("-webkit-app-region", "no-drag");
    await expect(desktopButton).toHaveCSS("-webkit-app-region", "no-drag");

    const clickAndVerifyHitTarget = async (button: typeof chatButton) => {
      const hitTargetInsideButton = await button.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const target = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return target != null && el.contains(target);
      });
      expect(hitTargetInsideButton).toBe(true);
      await button.click();
    };

    await clickAndVerifyHitTarget(chatButton);
    const chat = page.locator(".ai-engineer-panel:not(.is-home-workspace)");
    await expect(chat).toBeVisible();
    await clickAndVerifyHitTarget(desktopButton);
    await expect(page.getByTestId("host-desktop-panel")).toBeVisible();
    await expect(chat).toHaveAttribute("aria-hidden", "true");
    await expect(chat).toHaveAttribute("inert", "");
    await clickAndVerifyHitTarget(chatButton);
    await expect(chat).toBeVisible();
    await expect(page.getByTestId("host-desktop-panel")).toHaveCount(0);

    for (let cycle = 0; cycle < 5; cycle += 1) {
      await expect(desktopButton).toBeEnabled();
      await clickAndVerifyHitTarget(desktopButton);
      await expect(page.getByTestId("host-desktop-panel")).toBeVisible();
      await expect(chat).toHaveAttribute("aria-hidden", "true");
      await expect(chatButton).toBeEnabled();
      await clickAndVerifyHitTarget(chatButton);
      await expect(chat).toBeVisible();
      await expect(page.getByTestId("host-desktop-panel")).toHaveCount(0);
    }
  });

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

  test("maximized Desktop app covers the Dock and reveals it from the bottom edge", async ({
    page,
  }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();
    await page.getByTestId("local-fs-tool").click();
    await page.getByTestId("dock-app-files").click();

    const app = page.getByTestId("host-file-manager-panel");
    await page.getByTestId("host-file-manager-maximize").click();
    await expect(app).toHaveAttribute("data-maximized", "true");

    const stage = page.locator(".host-desktop-stage");
    const stageBox = await stage.boundingBox();
    const appBoxBeforeReveal = await app.boundingBox();
    expect(stageBox && appBoxBeforeReveal).toBeTruthy();
    expect(appBoxBeforeReveal!.y + appBoxBeforeReveal!.height).toBeGreaterThanOrEqual(
      stageBox!.y + stageBox!.height - 2,
    );

    const dock = page.getByTestId("host-desktop-dock");
    await expect(dock).toHaveAttribute("data-visible", "false");
    const revealZone = page.getByTestId("host-desktop-dock-reveal-zone");
    const revealBox = await revealZone.boundingBox();
    expect(revealBox).toBeTruthy();
    await page.mouse.move(
      revealBox!.x + revealBox!.width / 2,
      revealBox!.y + revealBox!.height / 2,
    );
    await expect(dock).toHaveAttribute("data-visible", "true");

    const appBoxAfterReveal = await app.boundingBox();
    expect(appBoxAfterReveal).toEqual(appBoxBeforeReveal);
    await dock.getByTestId("dock-app-files").click();
    await expect(app).toHaveAttribute("data-maximized", "true");

    await page.mouse.move(stageBox!.x + 24, stageBox!.y + 24);
    await expect(dock).toHaveAttribute("data-visible", "true");
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    await expect(dock).toHaveAttribute("data-visible", "false");
    await dock.getByTestId("dock-app-files").focus();
    await expect(dock).toHaveAttribute("data-visible", "true");

    await page.getByTestId("host-file-manager-maximize").click();
    await expect(app).toHaveAttribute("data-maximized", "false");
    await expect(dock).toHaveAttribute("data-visible", "true");

    await page.getByTestId("host-file-manager-maximize").click();
    await expect(dock).toHaveAttribute("data-visible", "false");
    await page.getByTestId("host-file-manager-minimize").click();
    await expect(app).toHaveCount(0);
    await expect(dock).toHaveAttribute("data-visible", "true");

    await dock.getByTestId("dock-app-files").click();
    await expect(app).toHaveAttribute("data-maximized", "true");
    await expect(dock).toHaveAttribute("data-visible", "false");
    await page.getByTestId("host-file-manager-close").click();
    await expect(app).toHaveCount(0);
    await expect(dock).toHaveAttribute("data-visible", "true");
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
    const stageBox = await page.locator(".host-desktop-stage").boundingBox();
    const dock = page.getByTestId("host-desktop-dock");
    const maxBox = await page.getByTestId("host-terminal-panel").boundingBox();
    expect(stageBox && maxBox).toBeTruthy();
    expect(maxBox!.y + maxBox!.height).toBeGreaterThanOrEqual(
      stageBox!.y + stageBox!.height - 2,
    );
    await expect(dock).toHaveAttribute("data-visible", "false");
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
