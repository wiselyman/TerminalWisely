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
    const assertCenteredPickerTitle = async (dialog: typeof newFolderDialog) => {
      const header = dialog.locator(".markwisely-picker-head");
      const title = header.locator("strong");
      const headerBox = await header.boundingBox();
      const titleBox = await title.boundingBox();
      expect(headerBox?.height ?? Infinity).toBeLessThanOrEqual(40);
      expect(Math.abs((titleBox?.x ?? 0) + (titleBox?.width ?? 0) / 2 - ((headerBox?.x ?? 0) + (headerBox?.width ?? 0) / 2))).toBeLessThanOrEqual(1);
    };
    await assertCenteredPickerTitle(newFolderDialog);
    await expect(page.getByTestId("markwisely-home")).toBeVisible();
    await expect(newFolderDialog.locator(".local-fs-toolbar")).toBeVisible();
    await expect(newFolderDialog.getByTestId("local-fs-path-breadcrumb")).toBeVisible();
    await expect(newFolderDialog.locator(".local-fs-list-header")).toBeVisible();
    await expect(newFolderDialog.getByTestId("markwisely-folder-entry").first().locator("svg.local-fs-entry-icon.is-folder")).toBeVisible();
    const cancelFolderButton = newFolderDialog.getByRole("button", { name: "Cancel" });
    await expect(cancelFolderButton).toHaveAttribute("title", "Cancel");
    await expect(cancelFolderButton.locator("svg.lucide-x")).toBeVisible();
    await expect(cancelFolderButton).toHaveText("");
    const useFolderButton = newFolderDialog.getByRole("button", { name: "Use this folder" });
    await expect(newFolderDialog.locator(".markwisely-picker-head").getByTestId("markwisely-use-folder")).toHaveCount(0);
    await expect(newFolderDialog.locator(".local-fs-tool-group").getByTestId("markwisely-use-folder")).toBeVisible();
    await expect(useFolderButton).toHaveAttribute("title", "Use this folder");
    await expect(useFolderButton.locator("svg.lucide-folder-check")).toBeVisible();
    await expect(useFolderButton).toHaveText("");
    await newFolderDialog.getByTestId("markwisely-folder-entry").filter({ hasText: "logs" }).click();
    await newFolderDialog.getByTestId("local-fs-crumb-e2e").click();
    await expect(newFolderDialog.getByTestId("local-fs-crumb-e2e")).toHaveAttribute("title", "/home/e2e");
    await newFolderDialog.getByTestId("markwisely-folder-entry").filter({ hasText: "logs" }).click();
    await expect(newFolderDialog.getByTestId("local-fs-crumb-logs")).toHaveAttribute("title", "/home/e2e/logs");
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
    await assertCenteredPickerTitle(openDialog);
    await expect(openDialog.getByTestId("local-fs-crumb-logs")).toHaveAttribute("title", "/home/e2e/logs");
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
    await expect(panel.getByTestId("markwisely-current-file")).toHaveText("draft.md");
    expect(await panel.getByTestId("markwisely-save").count()).toBe(0);
    const floatingFilenameBox = await panel.getByTestId("markwisely-current-file").boundingBox();
    const floatingChromeBox = await panel.locator(".desktop-app-window-head").boundingBox();
    expect(floatingFilenameBox && floatingChromeBox ? Math.abs((floatingFilenameBox.x + floatingFilenameBox.width / 2) - (floatingChromeBox.x + floatingChromeBox.width / 2)) : Infinity).toBeLessThan(8);

    const editor = panel.locator('.vditor-ir [contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("# Saved from MarkWisely");
    const saveStatus = panel.getByTestId("markwisely-save-status");
    await expect(saveStatus).toContainText(/Saved|已保存/);
    const statusBox = await saveStatus.boundingBox();
    const editorViewBox = await panel.locator(".markwisely-editor-view").boundingBox();
    expect(statusBox && editorViewBox ? statusBox.x + statusBox.width : 0).toBeGreaterThan(editorViewBox ? editorViewBox.x + editorViewBox.width - 180 : Infinity);
    expect(statusBox && editorViewBox ? statusBox.y + statusBox.height : 0).toBeGreaterThan(editorViewBox ? editorViewBox.y + editorViewBox.height - 80 : Infinity);
    await expect.poll(async () => (await api.getLastPreviewSave())?.content ?? "").toContain("Saved from MarkWisely");

    await page.getByTestId("markwisely-maximize").click();
    const appChrome = page.getByTestId("desktop-maximized-app-controls");
    await expect(appChrome).toBeVisible();
    await expect(appChrome.locator(".desktop-app-window-head")).toHaveAttribute("data-tauri-drag-region", "");
    const maximizedFilename = appChrome.getByTestId("markwisely-current-file");
    await expect(maximizedFilename).toHaveText("draft.md");
    const maximizedTitleBox = await maximizedFilename.boundingBox();
    const appChromeBox = await appChrome.boundingBox();
    expect(maximizedTitleBox && appChromeBox ? Math.abs((maximizedTitleBox.x + maximizedTitleBox.width / 2) - (appChromeBox.x + appChromeBox.width / 2)) : Infinity).toBeLessThan(8);
    await appChrome.getByTestId("markwisely-maximize").click();
    await expect(panel).toHaveAttribute("data-maximized", "false");

    await expect(panel.getByRole("button", { name: /All files|全部文件/i })).toHaveCount(0);
    await panel.getByTestId("markwisely-close").click();
    const dockApp = page.getByTestId("dock-app-markwisely");
    await expect(panel).toHaveCount(0);
    await dockApp.click();
    await expect(page.getByTestId("markwisely-home")).toBeVisible();
    const recent = panel.getByRole("button", { name: /draft\.md/ });
    await expect(recent).toBeVisible();
    await recent.click();
    await expect(panel.locator(".vditor-ir")).toContainText("Saved from MarkWisely", { timeout: 30_000 });
  });

  test("MarkWisely export offers styled HTML, PDF, and Word outputs", async ({ page }) => {
    await page.addInitScript(() => {
      const root = window.top as Window & { __e2ePrintCalls?: number };
      root.__e2ePrintCalls ??= 0;
      window.print = () => { root.__e2ePrintCalls = (root.__e2ePrintCalls ?? 0) + 1; };
    });
    await gotoApp(page);
    const api = await twE2e(page);
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();
    await page.getByTestId("local-fs-tool").click();
    await page.getByTestId("dock-app-markwisely").click();
    await page.getByTestId("markwisely-new-document").click();
    await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
    await page.getByTestId("markwisely-file-name").fill("toolbar-actions.md");
    await page.getByTestId("markwisely-create-submit").click();

    const panel = page.getByTestId("markwisely-panel");
    const toolbar = panel.locator(".vditor-toolbar");
    await expect(toolbar).toBeVisible({ timeout: 30_000 });
    for (const action of ["open", "open-folder", "save", "save-as", "export"]) {
      await expect(toolbar.locator(`.markwisely-toolbar-${action} button`)).toBeVisible();
    }
    await expect(panel.locator(".vditor-toolbar")).toHaveCount(1);
    for (const [action, icon, label] of [
      ["open", "file-text", "Open Markdown"],
      ["open-folder", "folder-open", "Open Folder"],
      ["save", "save", "Save"],
      ["save-as", "file-plus2", "Save As"],
      ["export", "file-down", "Export"],
    ]) {
      const button = toolbar.locator(`.markwisely-toolbar-${action} button`);
      const svg = button.locator(`svg.lucide-${icon}`);
      await expect(svg).toBeVisible();
      await expect(button).toHaveAttribute("aria-label", label);
      await expect(button).toHaveAttribute("title", label);
      const svgStyle = await svg.evaluate((element) => ({
        fill: getComputedStyle(element).fill,
        stroke: getComputedStyle(element).stroke,
        strokeWidth: getComputedStyle(element).strokeWidth,
      }));
      expect(svgStyle.fill).toBe("none");
      expect(svgStyle.strokeWidth).toBe("2px");
      expect(svgStyle.stroke).not.toBe("none");
      await button.hover();
      await expect.poll(() => button.evaluate((element) => getComputedStyle(element, "::after").content)).toBe(`"${label}"`);
    }
    const actionOrder = await toolbar.locator(".markwisely-toolbar-action").evaluateAll((elements) =>
      elements.map((element) => Array.from(element.classList).find((className) => className.startsWith("markwisely-toolbar-") && className !== "markwisely-toolbar-action")),
    );
    expect(actionOrder).toEqual([
      "markwisely-toolbar-open",
      "markwisely-toolbar-open-folder",
      "markwisely-toolbar-save",
      "markwisely-toolbar-save-as",
      "markwisely-toolbar-export",
    ]);
    const toolbarBox = await toolbar.boundingBox();
    const leftActionBox = await toolbar.locator(".markwisely-toolbar-open").boundingBox();
    expect(toolbarBox && leftActionBox ? leftActionBox.x - toolbarBox.x : Infinity).toBeLessThan(40);
    for (const action of await toolbar.locator(".markwisely-toolbar-action").all()) {
      const actionBox = await action.boundingBox();
      expect(toolbarBox && actionBox ? actionBox.x - toolbarBox.x : Infinity).toBeLessThan((toolbarBox?.width ?? 0) * 0.5);
    }

    await toolbar.locator(".markwisely-toolbar-open button").click();
    const openDialog = page.getByRole("dialog", { name: "Open Markdown file" });
    await expect(openDialog).toBeVisible();
    await openDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(panel.locator(".vditor-ir")).toBeVisible();

    await toolbar.locator(".markwisely-toolbar-open-folder button").click();
    const folderDialog = page.getByRole("dialog", { name: "Choose folder" });
    await expect(folderDialog).toBeVisible();
    await folderDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(panel.locator(".vditor-ir")).toBeVisible();

    const editor = panel.locator('.vditor-ir [contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("TOOLBAR_SAVE_AS_CONTENT");
    await toolbar.locator(".markwisely-toolbar-save button").click();
    await expect.poll(async () => (await api.getLastPreviewSave())?.content ?? "").toContain("TOOLBAR_SAVE_AS_CONTENT");

    await toolbar.locator(".markwisely-toolbar-save-as button").click();
    const saveAsFolder = page.getByRole("dialog", { name: "Choose folder" });
    await expect(saveAsFolder).toBeVisible();
    await saveAsFolder.getByRole("button", { name: "Use this folder" }).click();
    await expect(page.getByTestId("markwisely-create-view")).toBeVisible();
    await page.getByTestId("markwisely-file-name").fill("toolbar-copy.md");
    await page.getByTestId("markwisely-save-as-submit").click();
    await expect(panel.getByTestId("markwisely-current-file")).toHaveText("toolbar-copy.md");
    await expect.poll(async () => (await api.getLastPreviewSave())?.content ?? "").toContain("TOOLBAR_SAVE_AS_CONTENT");

    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("UNSAVED_EXPORT_CONTENT");
    await expect(editor).toContainText("UNSAVED_EXPORT_CONTENT");

    const exportButton = toolbar.locator(".markwisely-toolbar-export button");
    await exportButton.click();
    const exportMenu = panel.getByTestId("markwisely-export-menu");
    await expect(exportMenu).toBeVisible();
    await expect(exportMenu.getByRole("button")).toHaveText(["HTML", "PDF", "Word (.docx)"]);
    await expect(exportMenu.getByRole("button", { name: /markdown/i })).toHaveCount(0);

    await api.setNextDialogSaveResult(null);
    await panel.getByTestId("markwisely-export-menu").getByRole("button", { name: "HTML" }).click();
    await expect(exportMenu).toHaveCount(0);
    await expect.poll(() => api.getLocalText("/tmp/markwisely-toolbar-export.html")).toBeNull();

    await api.failNextLocalWrite();
    await exportButton.click();
    await panel.getByTestId("markwisely-export-menu").getByRole("button", { name: "HTML" }).click();
    await expect(page.getByTestId("statusbar-toast-err").filter({ hasText: "Document export failed" })).toBeVisible();

    await exportButton.click();
    await panel.getByTestId("markwisely-export-menu").getByRole("button", { name: "HTML" }).click();
    await expect(page.getByTestId("statusbar-toast-ok").filter({ hasText: "/tmp/markwisely-toolbar-export.html" })).toBeVisible();
    await expect.poll(() => api.getLocalText("/tmp/markwisely-toolbar-export.html")).toContain("UNSAVED_EXPORT_CONTENT");
    await expect(exportMenu).toHaveCount(0);

    await exportButton.click();
    await panel.getByTestId("markwisely-export-menu").getByRole("button", { name: "Word (.docx)" }).click();
    await expect(page.getByTestId("statusbar-toast-ok").filter({ hasText: "/tmp/markwisely-toolbar-export.docx" })).toBeVisible();
    await expect(editor).toContainText("UNSAVED_EXPORT_CONTENT");
    const binaryExport = await api.getLastLocalBytesWrite();
    expect(binaryExport).toMatchObject({ path: "/tmp/markwisely-toolbar-export.docx" });
    expect(binaryExport?.base64).toMatch(/^UEsDB/);

    await exportButton.click();
    await api.setNextDialogSaveResult(null);
    await panel.getByTestId("markwisely-export-menu").getByRole("button", { name: "PDF" }).click();
    await expect(exportMenu).toHaveCount(0);
    await expect.poll(() => api.getLastLocalBytesWrite()).toMatchObject({ path: "/tmp/markwisely-toolbar-export.docx" });

    await exportButton.click();
    await api.setNextDialogSaveResult("/tmp/markwisely-toolbar-export.pdf");
    await api.failNextLocalWrite();
    await panel.getByTestId("markwisely-export-menu").getByRole("button", { name: "PDF" }).click();
    await expect(page.getByTestId("statusbar-toast-err").filter({ hasText: "Document export failed" })).toBeVisible();
    await expect(editor).toContainText("UNSAVED_EXPORT_CONTENT");

    await exportButton.click();
    await api.setNextDialogSaveResult("/tmp/latest.json");
    await panel.getByTestId("markwisely-export-menu").getByRole("button", { name: "PDF" }).click();
    await expect(page.getByTestId("statusbar-toast-ok").filter({ hasText: "/tmp/latest.pdf" })).toBeVisible();
    const pdfExport = await api.getLastLocalBytesWrite();
    expect(pdfExport).toMatchObject({ path: "/tmp/latest.pdf" });
    expect(pdfExport?.base64).toMatch(/^JVBERi0/);
    await expect(panel.getByTestId("markwisely-pdf-preview")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (window as Window & { __e2ePrintCalls?: number }).__e2ePrintCalls ?? 0)).toBe(0);
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfBytes = Uint8Array.from(Buffer.from(String(pdfExport?.base64), "base64"));
    const pdfDocument = await getDocument({ data: pdfBytes, useWorkerFetch: false }).promise;
    const pdfText = (await (await pdfDocument.getPage(1)).getTextContent()).items
      .flatMap((item) => "str" in item ? [item.str] : [])
      .join(" ");
    expect(pdfText).toContain("UNSAVED_EXPORT_CONTENT");
    expect(pdfText).toContain("MarkWisely");
    await expect(panel.locator(".vditor-ir")).toBeVisible();
  });

  test("MarkWisely editor resizes after maximizing and restoring its window", async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();
    await page.getByTestId("local-fs-tool").click();
    await page.getByTestId("dock-app-markwisely").click();
    const panel = page.getByTestId("markwisely-panel");
    await page.getByTestId("markwisely-new-document").click();
    await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
    await page.getByTestId("markwisely-file-name").fill("resize-check.md");
    await page.getByTestId("markwisely-create-submit").click();
    const editor = panel.locator(".vditor-ir");
    await expect(editor).toBeVisible({ timeout: 30_000 });

    const eastResize = page.getByTestId("desktop-window-resize-e");
    const resizeBox = await eastResize.boundingBox();
    expect(resizeBox).toBeTruthy();
    await page.mouse.move(resizeBox!.x + resizeBox!.width / 2, resizeBox!.y + resizeBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(resizeBox!.x + resizeBox!.width / 2 - 480, resizeBox!.y + resizeBox!.height / 2);
    await page.mouse.up();
    await expect.poll(async () => (await panel.boundingBox())?.width ?? 0).toBeLessThan(700);

    await page.getByTestId("markwisely-maximize").click();
    await expect(panel).toHaveAttribute("data-maximized", "true");
    await expect(page.locator(".app-shell")).toHaveClass(/desktop-app-chrome-mode/);
    await expect(page.getByTestId("sidebar-view-home")).toBeHidden();
    await expect(page.locator(".tab-bar")).toBeHidden();
    await expect(page.getByTestId("chrome-new-session")).toBeHidden();
    await expect(page.getByTestId("ai-engineer-tool")).toBeHidden();
    await expect(page.getByTestId("local-fs-tool")).toBeHidden();
    await expect(page.getByTestId("theme-switcher-trigger")).toBeHidden();
    await expect(page.getByTestId("locale-switcher-trigger")).toBeHidden();
    const appChrome = page.getByTestId("desktop-maximized-app-controls");
    await expect(appChrome).toBeVisible();
    await expect(appChrome.getByTestId("desktop-app-window-title")).toHaveText("MarkWisely");
    await expect(panel.locator(".desktop-app-window-head")).toHaveCount(0);
    await appChrome.getByTestId("markwisely-maximize").click();
    await expect(panel).toHaveAttribute("data-maximized", "false");
    await expect(page.locator(".app-shell")).not.toHaveClass(/desktop-app-chrome-mode/);
    await expect(page.getByTestId("sidebar-view-home")).toBeVisible();
    await expect(page.locator(".tab-bar")).toBeVisible();

    await expect.poll(async () => {
      const editorBox = await panel.locator('.vditor-ir [contenteditable="true"]').first().boundingBox();
      const contentBox = await panel.locator(".markwisely-editor").boundingBox();
      return editorBox && contentBox ? editorBox.width / contentBox.width : 0;
    }).toBeGreaterThan(0.8);
    await expect.poll(async () => {
      const sizes = await page.evaluate(() => {
        const panel = document.querySelector('[data-testid="markwisely-panel"]');
        const content = panel?.querySelector(".vditor-content");
        const host = panel?.querySelector(".markwisely-editor");
        return content && host ? content.getBoundingClientRect().width - host.getBoundingClientRect().width : Infinity;
      });
      return sizes;
    }).toBeLessThanOrEqual(2);
    const restoredSizes = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="markwisely-panel"]');
      const rect = (selector: string) => {
        const node = panel?.querySelector(selector);
        return node ? node.getBoundingClientRect().width : 0;
      };
      return {
        editor: rect('.vditor-ir [contenteditable="true"]'),
        host: rect(".markwisely-editor"),
        wrapper: rect(".preview-markdown-wysiwyg"),
        vditor: rect(".vditor"),
        content: rect(".vditor-content"),
      };
    });
    expect(restoredSizes.host).toBeGreaterThan(300);
    expect(restoredSizes.editor).toBeGreaterThanOrEqual(restoredSizes.host * 0.8);
    expect(restoredSizes.editor).toBeGreaterThan(240);
    expect(restoredSizes.content).toBeLessThanOrEqual(restoredSizes.host + 2);
  });

  test("MarkWisely picker filters non-Markdown files and autosaves before leaving a document", async ({ page }) => {
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
    await expect(panel.getByRole("button", { name: /All files|全部文件/i })).toHaveCount(0);
    await panel.getByTestId("markwisely-close").click();
    await expect(panel).toHaveCount(0);
    await page.getByTestId("dock-app-markwisely").click();
    await expect(page.getByTestId("markwisely-home")).toBeVisible();
    await page.getByTestId("markwisely-open-document").click();
    await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
    await expect(page.getByTestId("markwisely-file-entry")).toContainText("note.md");
    await expect(panel.getByText("app.log")).toHaveCount(0);
    await page.getByTestId("markwisely-file-entry").click();
    await expect(panel.locator(".vditor-ir")).toContainText("UNIQUE_WYSIWYG_MARKER_42", { timeout: 30_000 });

    await panel.getByTestId("markwisely-close").click();
    await expect(panel).toHaveCount(0);
    await page.getByTestId("dock-app-markwisely").click();
    await page.getByTestId("markwisely-new-document").click();
    const chooseNextFolder = page.getByRole("dialog", { name: "Choose folder" });
    await expect(chooseNextFolder.getByTestId("local-fs-crumb-e2e")).toHaveAttribute("title", "/home/e2e");
    await chooseNextFolder.getByRole("button", { name: "Cancel" }).click();
    await panel.getByRole("button", { name: /note\.md/ }).click();
    await expect(panel.locator(".vditor-ir")).toContainText("UNIQUE_WYSIWYG_MARKER_42", { timeout: 30_000 });

    const editor = panel.locator('.vditor-ir [contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("unsaved draft");
    await panel.getByTestId("markwisely-close").click();
    await expect(panel).toHaveCount(0);
    await page.getByTestId("dock-app-markwisely").click();
    await expect(page.getByTestId("markwisely-home")).toBeVisible();
    expect((await api.getLastPreviewSave())?.content).toContain("unsaved draft");
    await panel.getByRole("button", { name: /note\.md/ }).click();
    await expect(panel.locator(".vditor-ir")).toContainText("unsaved draft");
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

  test("Desktop toolbar uses the machine name and omits the collapse button", async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();
    await page.getByTestId("local-fs-tool").click();

    const panel = page.getByTestId("host-desktop-panel");
    await expect(panel.getByRole("heading", { name: "Desktop" })).toBeVisible();
    await api.setHostMachineName("e2e-machine");
    await expect(panel.getByRole("heading", { name: "e2e-machine" })).toBeVisible({ timeout: 5_000 });
    await expect(panel.getByRole("heading", { name: "e2e@127.0.0.1" })).toHaveCount(0);
    await expect(panel.locator(".host-desktop-menubar .workspace-panel-icon-btn")).toHaveCount(0);

    await page.getByTestId("ai-engineer-tool").click();
    const chat = page.locator(".ai-engineer-panel:not(.is-home-workspace)");
    await expect(chat.locator(".workspace-panel-head-actions .workspace-panel-icon-btn")).toBeVisible();
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
    await expect(page.locator(".host-desktop-menubar")).toHaveCount(0);
    const appChrome = page.getByTestId("desktop-maximized-app-controls");
    await expect(appChrome).toBeVisible();
    await expect(appChrome.getByTestId("desktop-app-window-title")).toBeVisible();
    await expect(app.locator(".desktop-app-window-head")).toHaveCount(0);
    await expect(appChrome.getByTestId("host-file-manager-minimize")).toBeVisible();
    await expect(appChrome.getByTestId("host-file-manager-maximize")).toBeVisible();
    await expect(appChrome.getByTestId("host-file-manager-close")).toBeVisible();

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

    await appChrome.getByTestId("host-file-manager-maximize").click();
    await expect(app).toHaveAttribute("data-maximized", "false");
    await expect(page.locator(".host-desktop-menubar")).toBeVisible();
    await expect(appChrome).toHaveCount(0);
    await expect(dock).toHaveAttribute("data-visible", "true");

    await page.getByTestId("host-file-manager-maximize").click();
    await expect(dock).toHaveAttribute("data-visible", "false");
    await page.getByTestId("desktop-maximized-app-controls").getByTestId("host-file-manager-minimize").click();
    await expect(app).toHaveCount(0);
    await expect(dock).toHaveAttribute("data-visible", "true");

    await dock.getByTestId("dock-app-files").click();
    await expect(app).toHaveAttribute("data-maximized", "false");
    await expect(dock).toHaveAttribute("data-visible", "true");
    await page.getByTestId("host-file-manager-maximize").click();
    await expect(appChrome).toBeVisible();
    await appChrome.getByTestId("host-file-manager-close").click();
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
