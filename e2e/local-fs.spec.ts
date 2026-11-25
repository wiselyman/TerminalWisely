import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("Local FS panel", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await api.openLocalFsPanel();
  });

  test("local Files uses Finder navigation, metadata columns, and local context actions", async ({ page }) => {
    const api = await twE2e(page);
    await api.openHome();
    await api.openLocalDesktopFiles();
    const panel = page.getByTestId("host-file-manager-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("local-fs-tree")).toBeVisible();
    await expect(panel.getByTestId("local-fs-contents")).toBeVisible();
    for (const column of ["Name", "Permissions", "Owner", "Group", "Size", "Modified"]) {
      await expect(panel.getByRole("columnheader", { name: column })).toBeVisible();
    }

    const original = panel.locator('[data-path="/tmp/e2e-file.txt"]');
    await original.click({ button: "right" });
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Download file" })).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Duplicate" }).click();
    await expect(panel.locator('[data-path="/tmp/e2e-file copy.txt"]')).toBeVisible();

    const copy = panel.locator('[data-path="/tmp/e2e-file copy.txt"]');
    await copy.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await page.getByTestId("local-files-action-input").fill("e2e-renamed.txt");
    await page.getByTestId("local-files-action-confirm").click();
    await expect(panel.locator('[data-path="/tmp/e2e-renamed.txt"]')).toBeVisible();

    await panel.getByTestId("local-files-new-folder").click();
    await page.getByTestId("local-files-action-input").fill("e2e-created-folder");
    await page.getByTestId("local-files-action-confirm").click();
    await expect(panel.locator('.local-fs-row[data-path="/tmp/e2e-created-folder"]')).toBeVisible();

    page.once("dialog", (dialog) => dialog.dismiss());
    await panel.locator('[data-path="/tmp/e2e-renamed.txt"]').click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(panel.locator('[data-path="/tmp/e2e-renamed.txt"]')).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await panel.locator('[data-path="/tmp/e2e-renamed.txt"]').click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(panel.locator('[data-path="/tmp/e2e-renamed.txt"]')).toHaveCount(0);
  });

  test("double-clicking local text opens it in a normal EditorWisely window", async ({ page }) => {
    const api = await twE2e(page);
    await api.openHome();
    await api.seedLocalText("/tmp/e2e-open-in-editor.txt", "opened from local Files");
    await api.openLocalDesktopFiles();

    const files = page.getByTestId("host-file-manager-panel");
    const file = files.locator('[data-path="/tmp/e2e-open-in-editor.txt"]');
    await expect(file).toBeVisible();
    await file.dblclick();

    const editor = page.getByTestId("editorwisely-window");
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute("data-maximized", "false");
    await expect(editor.getByTestId("editorwisely-tree")).toBeVisible();
    const treeToggle = editor.getByTestId("editorwisely-tree-toggle");
    await expect(treeToggle).toHaveAttribute("aria-pressed", "true");
    await treeToggle.click();
    await expect(treeToggle).toHaveAttribute("aria-pressed", "false");
    await expect(editor.getByTestId("editorwisely-tree")).toHaveCount(0);
    await treeToggle.click();
    await expect(editor.getByTestId("editorwisely-tree")).toBeVisible();
    await editor.getByTestId("editorwisely-maximize").click();
    await expect(editor).toHaveAttribute("data-maximized", "true");
    await page.getByTestId("editorwisely-maximize").click();
    await expect(editor).toHaveAttribute("data-maximized", "false");
    await expect(editor.getByTestId("editorwisely-editor").locator(".cm-content"))
      .toHaveText("opened from local Files");
  });

  test("double-clicking SSH text opens it in a normal EditorWisely window", async ({ page }) => {
    const files = page.getByTestId("host-file-manager-panel");
    const file = files.locator('[data-path="/var/log/app.log"]');
    await expect(file).toBeVisible();
    await file.dblclick();

    const editor = page.getByTestId("editorwisely-window");
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute("data-maximized", "false");
    await expect(editor.getByTestId("editorwisely-tree")).toBeVisible();
    await expect(editor.getByTestId("editorwisely-editor").locator(".cm-content"))
      .toHaveText("remote text");
  });

  test("EditorWisely tree expands to the active SSH file directory", async ({ page }) => {
    const api = await twE2e(page);
    api.enableNestedEditorTreeFixture();
    await api.openEditorWiselyDocument("/home/e2e/editor-tree-fixture/src/vision/vision_pipeline.cpp");

    const editor = page.getByTestId("editorwisely-window");
    await expect(editor).toBeVisible();
    const tree = editor.getByTestId("editorwisely-tree");
    for (const directory of ["editor-tree-fixture", "src", "vision"]) {
      await expect(tree.getByTestId("editorwisely-tree-directory").filter({ hasText: directory }))
        .toHaveAttribute("aria-expanded", "true");
    }
    const activeFile = tree.getByTestId("editorwisely-tree-file").filter({ hasText: "vision_pipeline.cpp" });
    await expect(activeFile).toBeVisible();
    await expect(activeFile).toHaveClass(/is-active/);
  });

  test("opens desktop + file manager float with file tree", async ({ page }) => {
    await expect(page.getByTestId("host-desktop-panel")).toBeVisible({
      timeout: 15_000,
    });
    const panel = page.getByTestId("host-file-manager-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".desktop-app-window-title")).toHaveText("Files");
    await expect(page.getByTestId("host-file-manager-minimize")).toBeVisible();
    await expect(page.getByTestId("host-file-manager-close")).toBeVisible();
    await expect(page.getByTestId("local-fs-split")).toBeVisible();
  });

  test("local Files can be dragged into the Dock area while the Dock stays clickable", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const api = await twE2e(page);
    await api.openHome();
    await api.openLocalDesktopFiles();

    const app = page.getByTestId("host-file-manager-panel");
    const float = page.getByTestId("host-file-manager-float");
    const title = app.getByTestId("desktop-app-window-title");
    const dock = page.getByTestId("host-desktop-dock");
    const dockApp = page.getByTestId("dock-app-ai-local");
    const before = await float.boundingBox();
    const titleBox = await title.boundingBox();
    const dockBox = await dock.boundingBox();
    expect(before && titleBox && dockBox).toBeTruthy();

    await page.mouse.move(titleBox!.x + titleBox!.width / 2, titleBox!.y + titleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(titleBox!.x + titleBox!.width / 2, titleBox!.y + titleBox!.height / 2 + 700, { steps: 8 });
    await page.mouse.up();

    const moved = await float.boundingBox();
    expect(moved).toBeTruthy();
    expect(moved!.y + moved!.height).toBeGreaterThan(dockBox!.y);
    const dockHit = await dockApp.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        ?.closest(".host-desktop-dock") != null;
    });
    expect(dockHit).toBe(true);
    await dockApp.click();
    await expect(dockApp).toHaveAttribute("data-state", "open");
  });

  test("Linux file metadata stays in list view and icon view shows filenames only", async ({ page }) => {
    const panel = page.getByTestId("host-file-manager-panel");
    await expect(panel.getByText("Permissions")).toBeVisible();
    await expect(panel.getByText("Owner")).toBeVisible();
    await expect(panel.getByText("Group")).toBeVisible();
    await expect(panel.getByText("Modified")).toBeVisible();
    const row = panel.locator('[data-path="/var/log/app.log"]');
    const expectedModified = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(1_729_700_000_125));
    await expect(row).toContainText("-rw-r-----");
    await expect(row).toContainText("ubuntu");
    await expect(row).toContainText("adm");
    await expect(row).toContainText(expectedModified);

    await panel.getByRole("button", { name: "Icon view" }).click();
    const card = panel.locator('[data-path="/var/log/app.log"]');
    await expect(card).toContainText("app.log");
    await expect(card.locator(".local-fs-grid-meta")).toHaveCount(0);
    await expect(card).not.toContainText("-rw-r-----");
    await expect(card).not.toContainText("ubuntu");
    await expect(card).not.toContainText("4.0 KB");
    await expect(card).not.toContainText(expectedModified);
  });

  test("file list sorts by name, size, and modified time when their headers are activated", async ({ page }) => {
    const panel = page.getByTestId("host-file-manager-panel");
    const rows = panel.locator(".local-fs-row-name");

    await panel.getByTestId("local-fs-sort-name").click();
    await expect(panel.getByTestId("local-fs-sort-name").locator(".."))
      .toHaveAttribute("aria-sort", "ascending");
    await expect(rows).toHaveText(["logs", "app.log", "guide.md"]);
    await panel.getByTestId("local-fs-sort-name").click();
    await expect(rows).toHaveText(["logs", "guide.md", "app.log"]);

    await panel.getByTestId("local-fs-sort-size").click();
    await expect(rows).toHaveText(["logs", "guide.md", "app.log"]);
    await panel.getByTestId("local-fs-sort-size").click();
    await expect(rows).toHaveText(["logs", "app.log", "guide.md"]);

    await panel.getByTestId("local-fs-sort-modified").click();
    await expect(panel.getByTestId("local-fs-sort-modified").locator(".."))
      .toHaveAttribute("aria-sort", "ascending");
    await expect(rows).toHaveText(["logs", "app.log", "guide.md"]);
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
    await expect(page.getByRole("menuitem", { name: "Run in Terminal" })).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Copy file name" }).click();
    await panel.locator('[data-testid="local-fs-contents"]').click({ button: "right", position: { x: 20, y: 20 } });
    await expect(page.getByRole("menuitem", { name: "Upload" })).toBeVisible({ timeout: 1_000 });
  });

  test("runs a shell script from the current SSH session context menu", async ({ page }) => {
    const api = await twE2e(page);
    const openedDirectory = await api.getLastEnterDirectory();
    const directory = String(openedDirectory?.remote_path ?? "/home/e2e");
    const scriptPath = `${directory.replace(/\/$/, "")}/run me.sh`;
    await api.seedRemotePath(scriptPath);
    const panel = page.getByTestId("host-file-manager-panel");
    await panel.getByRole("button", { name: "Refresh" }).click();
    const script = panel.locator(`[data-path="${scriptPath}"]`);
    await expect(script).toBeVisible();
    await script.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Run in Terminal" }).click();
    await expect.poll(() => api.getLastTerminalCommand(), { timeout: 5_000 }).toEqual({
      session_id: "e2e-ssh-session-1",
      command: `cd -- '${directory}' && '/bin/bash' './run me.sh'\r`,
    });
  });

  test("runs an unknown-extension file from its shebang", async ({ page }) => {
    const api = await twE2e(page);
    const openedDirectory = await api.getLastEnterDirectory();
    const directory = String(openedDirectory?.remote_path ?? "/home/e2e");
    const scriptPath = `${directory.replace(/\/$/, "")}/job.task`;
    await api.seedRemotePath(scriptPath);
    const panel = page.getByTestId("host-file-manager-panel");
    await panel.getByRole("button", { name: "Refresh" }).click();
    const script = panel.locator(`[data-path="${scriptPath}"]`);
    await expect(script).toBeVisible();
    await script.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Run in Terminal" }).click();
    await expect.poll(() => api.getLastTerminalCommand(), { timeout: 5_000 }).toEqual({
      session_id: "e2e-ssh-session-1",
      command: `cd -- '${directory}' && '/usr/bin/env' 'node' './job.task'\r`,
    });
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
