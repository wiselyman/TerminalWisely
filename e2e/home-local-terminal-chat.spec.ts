import { expect, test } from "@playwright/test";
import { clickMarkWiselyMenuControl, gotoApp, twE2e } from "./tw-e2e";

test("Pinned Local Desktop opens its Terminal app without a Terminal tab", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHomeDirectory();
  await expect(page.getByTestId("home-host-directory")).toBeVisible();
  await expect(page.getByTestId("home-terminal-tab")).toHaveCount(0);

  await page.getByTestId("local-desktop-tab").click();
  await expect(page.getByTestId("local-desktop-tab")).toBeVisible();
  await expect(page.getByTestId("host-desktop-panel")).toBeVisible();
  await page.getByTestId("dock-app-terminal").click();
  await expect(page.getByTestId("desktop-terminal-host")).toBeVisible();
  await expect(page.getByTestId("home-terminal-tab")).toHaveCount(0);
});

test("Home local Desktop target isolation", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();

  const home = page.getByTestId("home-local-chat");
  await expect(page.getByTestId("local-fs-tool")).toBeVisible();
  await page.getByTestId("local-fs-tool").click();
  await expect(page.getByTestId("host-desktop-panel")).toBeVisible();
  await expect(page.getByTestId("desktop-icon-aiLinux")).toHaveCount(0);
  for (const app of ["files", "processes", "browser"]) {
    await expect(page.getByTestId(`dock-app-${app}`)).toHaveCount(0);
    await expect(page.getByTestId(`desktop-icon-${app}`)).toHaveCount(0);
  }
  for (const app of ["terminal", "ai-local", "markwisely"]) {
    await expect(page.getByTestId(`dock-app-${app}`)).toBeVisible();
  }
  await expect(page.getByTestId("home-local-terminal")).toBeVisible();

  await page.getByTestId("local-fs-tool").click();
  await expect(page.getByTestId("host-desktop-panel")).toHaveCount(0);
  await expect(home).toBeVisible();
  await expect(page.getByTestId("home-local-terminal")).toBeVisible();
});

test("Home MarkWisely stores pasted Markdown images beside the local document", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-new-document").click();
  await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
  await page.getByTestId("markwisely-file-name").fill("local-note.md");
  await page.getByTestId("markwisely-create-submit").click();

  const panel = page.getByTestId("markwisely-panel");
  await expect(panel.locator(".vditor-ir")).toBeVisible({ timeout: 30_000 });
  await expect(panel.locator(".markwisely-editor .vditor-toolbar")).toBeHidden();
  const headerActions = panel.getByTestId("markwisely-window-header-tools");
  const headerMenuTrigger = headerActions.getByTestId("markwisely-document-actions");
  await expect(headerMenuTrigger).toBeVisible();
  await expect(headerActions.getByTestId("markwisely-sidebar-toggle")).toBeVisible();
  await expect(headerActions.getByTestId("markwisely-view-mode-toggle")).toBeVisible();
  await expect(panel.getByTestId("markwisely-save-status")).toBeHidden();
  await headerMenuTrigger.click();
  const headerMenu = panel.getByTestId("markwisely-action-menu");
  await expect(headerMenu.getByTestId("markwisely-outline-toggle")).toHaveCount(0);
  await expect(panel.getByTestId("markwisely-outline-toggle")).toBeVisible();
  await expect(headerMenu.getByTestId("markwisely-preferences-toggle")).toHaveCount(0);
  await headerMenuTrigger.click();
  const editor = panel.locator('.vditor-ir .vditor-reset[contenteditable="true"]');
  await editor.dispatchEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 180, clientY: 160 });
  const formatMenu = panel.getByTestId("markwisely-format-context-menu");
  await expect(formatMenu).toBeVisible();
  for (const command of ["Insert table", "Insert link", "Task list", "Horizontal rule", "Heading 6"]) {
    await expect(formatMenu.getByRole("menuitem", { name: command })).toBeVisible();
  }
  const fileChooser = page.waitForEvent("filechooser");
  await formatMenu.getByRole("menuitem", { name: "Insert image" }).click();
  await (await fileChooser).setFiles({
    name: "图表 draft.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71]),
  });

  await expect.poll(() => api.getLastLocalBytesWrite()).toMatchObject({ path: "/tmp/图表 draft.png" });
  await expect.poll(() => panel.locator(".vditor-ir").innerText()).toContain("图表 draft.png");
});

test("Home MarkWisely stores clipboard images in a sibling images folder and keeps plain text paste", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-new-document").click();
  await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
  await page.getByTestId("markwisely-file-name").fill("clipboard-note.md");
  await page.getByTestId("markwisely-create-submit").click();
  const editor = page.locator('.markwisely-editor .vditor-ir .vditor-reset[contenteditable="true"]');
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.items.add(new File([new Uint8Array([137, 80, 78, 71])], "clipboard diagram.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect.poll(() => api.getLastLocalBytesWrite()).toMatchObject({ path: "/tmp/images/clipboard diagram.png" });
  await expect.poll(() => api.getLocalText("/tmp/clipboard-note.md")).toContain("![clipboard diagram.png](images/clipboard%20diagram.png)");
  await expect.poll(() => page.getByTestId("markwisely-panel").locator(".vditor-ir").innerText()).toContain("clipboard diagram.png");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("plain clipboard text"));
  await editor.click();
  await page.keyboard.press("ControlOrMeta+V");
  await expect.poll(() => api.getLocalText("/tmp/clipboard-note.md")).toContain("plain clipboard text");
});

test("Home MarkWisely keeps three icon-only controls left of the centered filename", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.setPandocFormats(["docx", "html"], ["epub"]);
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-new-document").click();
  await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
  await page.getByTestId("markwisely-file-name").fill("header-controls.md");
  await page.getByTestId("markwisely-create-submit").click();

  const panel = page.getByTestId("markwisely-panel");
  const controls = panel.getByTestId("markwisely-window-header-tools");
  await expect(controls).toBeVisible();
  const orderedControls = await controls.locator(":scope > button").evaluateAll((buttons) => buttons.map((button) => (button as HTMLElement).dataset.testid));
  expect(orderedControls).toEqual(["markwisely-sidebar-toggle", "markwisely-view-mode-toggle", "markwisely-document-actions"]);
  await expect(controls.locator("button")).toHaveCount(3);
  for (const button of await controls.locator("button").all()) {
    await expect(button).toHaveText("");
    await expect(button).toHaveAttribute("aria-label", /.+/);
  }
  await controls.getByTestId("markwisely-document-actions").click();
  const menu = panel.getByTestId("markwisely-action-menu");
  const menuBox = await menu.boundingBox();
  const windowBox = await panel.boundingBox();
  expect(menuBox && windowBox ? menuBox.x : -1).toBeGreaterThanOrEqual(windowBox?.x ?? 0);
  expect(menuBox && windowBox ? menuBox.x + menuBox.width : Infinity).toBeLessThanOrEqual((windowBox?.x ?? 0) + (windowBox?.width ?? 0));
  await expect(menu.getByTestId("markwisely-preferences-toggle")).toHaveCount(0);
  await expect(menu.getByTestId("markwisely-outline-toggle")).toHaveCount(0);
  await expect(menu.getByTestId("markwisely-statistics-toggle")).toHaveCount(0);
  await expect(menu.getByTestId("markwisely-import-document")).toHaveText("Import document");
  const controlsBox = await controls.boundingBox();
  const filenameBox = await panel.getByTestId("markwisely-current-file").boundingBox();
  expect(controlsBox && filenameBox ? controlsBox.x + controlsBox.width : Infinity).toBeLessThan(filenameBox?.x ?? 0);
  await expect(panel.getByTestId("markwisely-statistics")).toContainText("words");

  await expect(menu).toBeVisible();
  await expect(menu).toBeInViewport();
  const menuItem = menu.getByRole("menuitem", { name: "Open Markdown" });
  await expect(menuItem).toBeVisible();
  const menuItemReceivesClick = await menuItem.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit != null && element.contains(hit);
  });
  expect(menuItemReceivesClick).toBe(true);
  await menuItem.click();
  await expect(panel.getByTestId("markwisely-picker")).toBeVisible();
});

test("Home MarkWisely keeps mixed Markdown in WYSIWYG and preserves local compatibility nodes", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  const source = [
    "---", "title: Keep exactly", "---", "", "Editable paragraph.", "",
    "<widget data-a='1'>", "  raw   value", "</widget>", "",
    "```unknown-engine option=x", "  raw payload  ", "```", "",
    "[^note]: Footnote   text", "[reference]: ./target with spaces", "",
  ].join("\n");
  await api.seedLocalText("/tmp/compatibility.md", source);
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-open-document").click();
  await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
  await page.getByTestId("markwisely-file-entry").filter({ hasText: "compatibility.md" }).click();

  const panel = page.getByTestId("markwisely-panel");
  await expect(panel.locator(".vditor-ir")).toBeVisible();
  await expect(panel.locator(".markwisely-editor .vditor-toolbar")).toBeHidden();
  const headerActions = panel.getByTestId("markwisely-window-header-tools");
  await expect(headerActions.getByTestId("markwisely-document-actions")).toBeVisible();
  await expect(panel.getByTestId("markwisely-compatibility-source")).toHaveCount(0);
  await expect(panel.getByTestId("markwisely-statistics")).toBeVisible();
  await expect(panel.getByTestId("markwisely-compatibility-node")).toHaveCount(4);
  const paragraph = panel.locator('.vditor-ir .vditor-reset[contenteditable="true"]');
  await paragraph.getByText(/Editable paragraph\./).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Edited");
  await expect.poll(() => api.getLocalText("/tmp/compatibility.md")).toContain("Editable paragraph. Edited");
  const htmlNode = panel.locator('[data-testid="markwisely-compatibility-node"][data-compatibility-kind="raw-html"]').first();
  await htmlNode.click();
  const nodeSource = panel.getByTestId("markwisely-compatibility-node-source");
  await expect(nodeSource).toHaveValue(/raw   value/);
  await nodeSource.fill("<widget data-a='1'>\n  updated raw value\n</widget>\n");
  await panel.getByRole("button", { name: "Cancel" }).click();
  await expect.poll(() => api.getLocalText("/tmp/compatibility.md")).not.toContain("updated raw value");
  await panel.locator('[data-testid="markwisely-compatibility-node"][data-compatibility-kind="raw-html"]').first().click();
  await panel.getByTestId("markwisely-compatibility-node-source").fill("<widget data-a='1'>\n  updated raw value\n</widget>\n");
  await panel.getByTestId("markwisely-compatibility-apply").click();
  await expect.poll(() => api.getLocalText("/tmp/compatibility.md")).toContain("updated raw value");
  const saved = await api.getLocalText("/tmp/compatibility.md");
  expect(saved).toContain("title: Keep exactly\n---\n\nEditable paragraph. Edited");
  expect(saved).toContain("<widget data-a='1'>\n  updated raw value\n</widget>");
  expect(saved).toContain("```unknown-engine option=x\n  raw payload  \n```");
  expect(saved).toContain("[^note]: Footnote   text\n[reference]: ./target with spaces");
  await clickMarkWiselyMenuControl(page, "markwisely-view-mode-toggle");
  await expect(panel.getByTestId("markwisely-compatibility-source")).toHaveValue(/updated raw value/);
  await clickMarkWiselyMenuControl(page, "markwisely-view-mode-toggle");
  await expect(panel.locator(".vditor-ir")).toBeVisible();
});

test("Home MarkWisely offers a local recovery draft without overwriting the file", async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(() => localStorage.setItem(
    "terminal-wisely.markwisely-drafts.v1",
    JSON.stringify({ local: { "/tmp/recovered-note.md": { text: "# Restored local draft", updatedAt: 1 } } }),
  ));
  const api = await twE2e(page);
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-new-document").click();
  await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
  await page.getByTestId("markwisely-file-name").fill("recovered-note.md");
  await page.getByTestId("markwisely-create-submit").click();

  const panel = page.getByTestId("markwisely-panel");
  const recovery = panel.getByTestId("markwisely-recovery-banner");
  await expect(recovery).toBeVisible();
  await expect(panel.locator(".vditor-ir")).not.toContainText("Restored local draft");
  await recovery.getByRole("button", { name: "Restore draft" }).click();
  await expect(panel.locator(".vditor-ir")).toContainText("Restored local draft");
  await expect(recovery).toHaveCount(0);
});

test("Home MarkWisely can discard a recovery draft without changing the saved document", async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(() => localStorage.setItem(
    "terminal-wisely.markwisely-drafts.v1",
    JSON.stringify({ local: { "/tmp/discard-note.md": { text: "# Unsaved recovery text", updatedAt: 1 } } }),
  ));
  const api = await twE2e(page);
  await api.seedLocalText("/tmp/discard-note.md", "# Original disk text");
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-open-document").click();
  await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
  const entry = page.getByRole("button", { name: "discard-note.md" });
  await expect(entry).toBeVisible();
  await entry.click();

  const panel = page.getByTestId("markwisely-panel");
  const recovery = panel.getByTestId("markwisely-recovery-banner");
  await expect(recovery).toBeVisible();
  await recovery.getByRole("button", { name: "Discard draft" }).click();
  await expect(recovery).toHaveCount(0);
  await expect(panel.locator(".vditor-ir")).toContainText("Original disk text");
  expect(await api.getLocalText("/tmp/discard-note.md")).toBe("# Original disk text");
});

test("Home MarkWisely retains dirty text and blocks close when saving fails", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-new-document").click();
  await page.getByTestId("markwisely-use-folder").click();
  await page.getByTestId("markwisely-file-name").fill("save-failure.md");
  await page.getByTestId("markwisely-create-submit").click();

  const panel = page.getByTestId("markwisely-panel");
  const editor = panel.locator('.vditor-ir [contenteditable="true"]').first();
  await expect(editor).toBeVisible();
  await editor.fill("# Preserve this dirty document");
  await expect(panel.getByTestId("markwisely-save-status")).toContainText(/Unsaved|未保存/);
  api.failNextLocalWrite();
  await panel.getByTestId("markwisely-close").click();

  await expect(panel).toBeVisible();
  await expect(panel.getByRole("alert")).toContainText("Mock local write failed");
  await expect(editor).toContainText("Preserve this dirty document");
  await panel.getByTestId("markwisely-close").click();
  await expect(panel).toHaveCount(0);
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-recent").filter({ hasText: "save-failure.md" }).click();
  await expect(page.getByTestId("markwisely-panel").locator(".vditor-ir")).toContainText("Preserve this dirty document");
});

test("Home MarkWisely browses and searches Markdown only in the local workspace", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.seedLocalText("/tmp/local-search.md", "Home workspace phrase LOCAL_SEARCH_PHRASE");
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-open-document").click();
  await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
  await page.getByTestId("markwisely-file-entry").filter({ hasText: "local-search.md" }).click();

  const sidebar = page.getByTestId("markwisely-sidebar");
  await clickMarkWiselyMenuControl(page, "markwisely-sidebar-toggle");
  await expect(sidebar.getByTestId("markwisely-sidebar-file").filter({ hasText: "local-search.md" })).toBeVisible();
  await sidebar.getByTestId("markwisely-search").fill("LOCAL_SEARCH_PHRASE");
  await sidebar.getByTestId("markwisely-search-start").click();
  await expect(sidebar.getByTestId("markwisely-search-result").filter({ hasText: "local-search.md" })).toBeVisible({ timeout: 30_000 });
  await expect(sidebar.getByTestId("markwisely-search-result").filter({ hasText: "Home workspace phrase" })).toBeVisible();
});

test("Home MarkWisely cancels an in-flight workspace search without showing partial results", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.seedLocalText("/tmp/cancel-search-a.md", "CANCEL_SEARCH_MATCH");
  await api.seedLocalText("/tmp/cancel-search-b.md", "CANCEL_SEARCH_MATCH");
  await api.setLocalReadDelay(500);
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-open-document").click();
  await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
  await page.getByTestId("markwisely-file-entry").filter({ hasText: "cancel-search-a.md" }).click();

  const sidebar = page.getByTestId("markwisely-sidebar");
  await clickMarkWiselyMenuControl(page, "markwisely-sidebar-toggle");
  await sidebar.getByTestId("markwisely-search").fill("CANCEL_SEARCH_MATCH");
  await sidebar.getByTestId("markwisely-search-start").click();
  await expect(sidebar.getByTestId("markwisely-search-progress")).toContainText("Searching");
  await sidebar.getByTestId("markwisely-search-cancel").click();
  await expect(sidebar.getByTestId("markwisely-search-progress")).toHaveCount(0);
  await expect(sidebar.getByTestId("markwisely-search-result")).toHaveCount(0);
});

test("Home MarkWisely opens the outline on the right without duplicating it in the file sidebar", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.seedLocalText("/tmp/right-outline.md", ["# First Heading", ...Array.from({ length: 12 }, (_, index) => `Paragraph ${index + 1}.`), "## Nested Heading"].join("\n\n"));
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-open-document").click();
  await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
  await page.getByTestId("markwisely-file-entry").filter({ hasText: "right-outline.md" }).click();

  const panel = page.getByTestId("markwisely-panel");
  const sidebar = panel.getByTestId("markwisely-sidebar");
  await expect(sidebar.locator(".markwisely-sidebar-outline")).toHaveCount(0);
  await clickMarkWiselyMenuControl(page, "markwisely-outline-toggle");
  const outline = panel.getByTestId("markwisely-outline-panel");
  await expect(outline).toBeVisible();
  const nestedHeading = outline.getByTestId("markwisely-outline-heading").filter({ hasText: "Nested Heading" });
  await nestedHeading.click();
  await expect(nestedHeading).toHaveAttribute("aria-current", "location");

  if (!(await sidebar.isVisible())) await clickMarkWiselyMenuControl(page, "markwisely-sidebar-toggle");
  await expect(sidebar).toBeVisible();
  await clickMarkWiselyMenuControl(page, "markwisely-sidebar-toggle");
  await expect(sidebar).toHaveCount(0);
  await expect(outline).toBeVisible();
});

test("Home MarkWisely outline tracks headings from the active document", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  const outlineSource = ["# First Heading", ...Array.from({ length: 20 }, (_, index) => `Paragraph ${index + 1} with text to create a scrollable document.`), "## Nested Heading"].join("\n\n");
  await api.seedLocalText("/tmp/outline.md", outlineSource);
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-open-document").click();
  await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
  await page.getByTestId("markwisely-file-entry").filter({ hasText: "outline.md" }).click();

  const panel = page.getByTestId("markwisely-panel");
  await clickMarkWiselyMenuControl(page, "markwisely-outline-toggle");
  const outline = panel.getByTestId("markwisely-outline-panel");
  await expect(outline).toBeVisible();
  await expect(outline).toContainText("First Heading");
  await expect(outline).toContainText("Nested Heading");
  const nestedEntry = outline.getByTestId("markwisely-outline-heading").filter({ hasText: "Nested Heading" });
  await panel.locator(".vditor-ir .vditor-reset[contenteditable='true']").evaluate((content) => { content.scrollTop = content.scrollHeight; });
  await expect(nestedEntry).toHaveAttribute("aria-current", "location");
});

test("Home MarkWisely filters outline headings and navigates to the selected heading", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.seedLocalText("/tmp/outline-filter.md", "# First Heading\n\n## Nested Heading\n\nMore text.\n");
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-open-document").click();
  await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
  await page.getByTestId("markwisely-file-entry").filter({ hasText: "outline-filter.md" }).click();

  await clickMarkWiselyMenuControl(page, "markwisely-outline-toggle");
  const outline = page.getByTestId("markwisely-outline-panel");
  const filter = outline.getByTestId("markwisely-outline-filter");
  await filter.fill("Nested");
  const heading = outline.getByTestId("markwisely-outline-heading");
  await expect(heading).toHaveCount(1);
  await expect(heading).toContainText("Nested Heading");
  await heading.click();
  await expect(page.locator(".markwisely-editor .vditor-reset h2").first()).toBeInViewport();
});

test("Home MarkWisely action menu omits Editor preferences without changing the app theme", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.seedLocalText("/tmp/preferences.md", "# Preferences test\n\nEditor content.");
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-open-document").click();
  await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
  await page.getByTestId("markwisely-file-entry").filter({ hasText: "preferences.md" }).click();

  const globalTheme = await page.evaluate(() => document.documentElement.dataset.theme ?? "");
  const globalBodyColor = await page.evaluate(() => getComputedStyle(document.body).color);
  await page.getByTestId("markwisely-document-actions").click();
  const actionMenu = page.getByTestId("markwisely-action-menu");
  await expect(actionMenu.getByTestId("markwisely-preferences-toggle")).toHaveCount(0);
  await expect(actionMenu).not.toContainText("Editor preferences");
  await expect(page.getByTestId("markwisely-preferences-panel")).toHaveCount(0);
  await page.getByTestId("markwisely-document-actions").click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme ?? "")).toBe(globalTheme);
  expect(await page.evaluate(() => getComputedStyle(document.body).color)).toBe(globalBodyColor);
});

test("Home MarkWisely renders math and Mermaid using only local assets", async ({ page }) => {
  await page.route("**/*", (route) => {
    const { hostname } = new URL(route.request().url());
    return ["127.0.0.1", "localhost"].includes(hostname) ? route.continue() : route.abort();
  });
  await gotoApp(page);
  const api = await twE2e(page);
  await api.seedLocalText(
    "/tmp/offline-render.md",
    "# Offline rendering\n\n$$\n\\sum_{n=1}^{3} n\n$$\n\n```mermaid\nflowchart TD\n  A[Start] --> B[Finish]\n```\n",
  );
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-open-document").click();
  await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
  await page.getByRole("button", { name: "offline-render.md" }).click();

  const editor = page.locator(".markwisely-editor .vditor-ir");
  await expect(editor.locator(".katex").first()).toBeVisible();
  await expect(editor.locator(".language-mermaid svg")).toBeVisible();
});

test("Home MarkWisely imports a Pandoc source into a new Markdown document", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.setPandocFormats(["docx", "html"], ["epub"]);
  await api.seedLocalText("/tmp/import-target.md", "# Existing content\n");
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-open-document").click();
  await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
  await page.getByTestId("markwisely-file-entry").filter({ hasText: "import-target.md" }).click();

  await page.getByTestId("markwisely-document-actions").click();
  const importButton = page.getByTestId("markwisely-import-document");
  await expect(importButton).toBeVisible();
  await api.setNextDialogOpenResult("/tmp/meeting-notes.docx");
  await importButton.click();
  await expect.poll(() => api.getLastPandocImport(), { timeout: 5_000 }).not.toBeNull();
  await expect(page.getByTestId("markwisely-create-view")).toBeVisible();
  await expect(page.getByTestId("markwisely-file-name")).toHaveValue("meeting-notes.md");
  await expect(page.getByRole("textbox", { name: /Folder|文件夹/i })).toHaveValue("/tmp");
  await page.getByTestId("markwisely-create-submit").click();
  await expect.poll(() => api.getMarkWiselyDocument("/tmp/meeting-notes.md"), { timeout: 5_000 }).toMatchObject({ text: expect.stringContaining("Imported from Word") });
  await expect.poll(() => api.getMarkWiselyDocument("/tmp/import-target.md"), { timeout: 5_000 }).toMatchObject({ text: "# Existing content\n" });
  await expect(page.getByTestId("markwisely-current-file")).toHaveText("meeting-notes.md");
  const editor = page.locator(".markwisely-editor .vditor-ir .vditor-reset[contenteditable='true']");
  await expect(editor).toContainText("Imported from Word");
  await expect.poll(() => api.getLastPandocImport()).toMatchObject({ from: "docx", path: "/tmp/meeting-notes.docx" });
  await expect.poll(() => api.getLocalText("/tmp/meeting-notes.md")).toContain("Imported from Word");
  await expect.poll(() => api.getLocalText("/tmp/import-target.md")).toBe("# Existing content\n");
});

test("Home titlebar Chat returns from Local Desktop to the existing chat", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();

  await page.getByTestId("ai-engineer-tool").click();
  const composer = page.getByTestId("home-local-chat").getByTestId("ai-engineer-composer").locator("textarea");
  await composer.fill("keep this Home chat draft");
  await page.getByTestId("local-fs-tool").click();
  await expect(page.getByTestId("host-desktop-panel")).toBeVisible();

  await page.getByTestId("ai-engineer-tool").click();

  await expect(page.getByTestId("host-desktop-panel")).toHaveCount(0);
  await expect(page.getByTestId("home-local-terminal")).toBeVisible();
  await expect(page.getByTestId("home-local-chat")).toBeVisible();
  await expect(composer).toHaveValue("keep this Home chat draft");
});

test("Local Desktop Terminal stays inside the Desktop workspace", async ({ page }) => {
  await gotoApp(page);
  await (await twE2e(page)).openHome();

  await page.getByTestId("local-fs-tool").click();
  await expect(page.getByTestId("host-desktop-panel")).toBeVisible();

  await page.getByTestId("dock-app-terminal").click();
  await expect(page.getByTestId("desktop-terminal-host")).toBeVisible();
  await expect(page.getByTestId("home-terminal-tab")).toHaveCount(0);
  await expect(page.getByTestId("home-local-terminal")).toBeVisible();
});

test("Home Desktop shows the complete MarkWisely icon label", async ({ page }) => {
  await gotoApp(page);
  await (await twE2e(page)).openHome();
  await page.getByTestId("local-fs-tool").click();

  const label = page.getByTestId("desktop-icon-markwisely").locator(".host-desktop-icon-label");
  await expect(label).toHaveText("MarkWisely");
  await expect.poll(() => label.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.whiteSpace === "normal" && element.scrollWidth <= element.clientWidth;
  })).toBe(true);
});

test("Home Desktop opens a local text file in EditorWisely and keeps MarkWisely available", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await expect(page.getByTestId("desktop-icon-editorwisely")).toBeVisible();
  await expect(page.getByTestId("desktop-icon-markwisely")).toBeVisible();
  await page.getByTestId("dock-app-editorwisely").click();
  await expect(page.getByTestId("editorwisely-window")).toBeVisible();
  await expect(page.getByTestId("editorwisely-home")).toBeVisible();
  await expect(page.getByTestId("dock-app-markwisely")).toBeVisible();
});

test("EditorWisely opens files through its own MarkWisely-style picker", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-editorwisely").click();
  await page.getByTestId("editorwisely-open-document").click();
  await expect(page.getByTestId("editorwisely-file-picker")).toBeVisible();
});

test("EditorWisely tree opens multiple files as tabs without losing the active document", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  await api.seedLocalText("/tmp/e2e-dir/tree-first.txt", "first tree document");
  await api.seedLocalText("/tmp/e2e-dir/tree-second.txt", "second tree document");
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-editorwisely").click();

  const tree = page.getByTestId("editorwisely-tree");
  await expect(tree).toBeVisible();
  await tree.getByRole("button", { name: "e2e-dir" }).click();
  await tree.getByRole("button", { name: "tree-first.txt" }).click();
  await expect(page.getByRole("tab", { name: "tree-first.txt" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("editorwisely-editor").locator(".cm-content")).toHaveText("first tree document");

  await tree.getByRole("button", { name: "tree-second.txt" }).click();
  await expect(page.getByRole("tab", { name: "tree-second.txt" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("editorwisely-editor").locator(".cm-content")).toHaveText("second tree document");
  await page.getByRole("tab", { name: "tree-first.txt" }).click();
  await expect(page.getByTestId("editorwisely-editor").locator(".cm-content")).toHaveText("first tree document");

  await page.getByRole("button", { name: "Close tree-second.txt" }).click();
  await expect(page.getByRole("tab", { name: "tree-second.txt" })).toHaveCount(0);
  await expect(page.getByTestId("editorwisely-editor").locator(".cm-content")).toHaveText("first tree document");
});

test("EditorWisely displays existing file contents after its asynchronous read finishes", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  await api.seedLocalText("/tmp/editor-reopen.md", "content from disk");
  await api.setLocalReadDelay(100);
  await page.getByTestId("local-fs-tool").click();
  await api.openEditorWiselyDocument("/tmp/editor-reopen.md");
  await expect(page.getByTestId("editorwisely-editor").locator(".cm-content"))
    .toHaveText("content from disk", { timeout: 3000 });
});

test("EditorWisely keeps saved contents when the document is closed and reopened", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  await api.seedLocalText("/tmp/editor-persist.md", "before");
  await page.getByTestId("local-fs-tool").click();
  await api.openEditorWiselyDocument("/tmp/editor-persist.md");
  const editor = page.getByTestId("editorwisely-editor").locator(".cm-content");
  await expect(editor).toHaveText("before", { timeout: 3000 });
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.type("after save");
  await expect(page.locator(".editorwisely-toolbar")).toContainText("Saved", { timeout: 3000 });
  await expect.poll(() => api.getLocalText("/tmp/editor-persist.md"))
    .toBe("after save");

  await page.getByRole("button", { name: "Close editor-persist.md" }).click();
  await expect(page.getByTestId("editorwisely-home")).toBeVisible();
  await api.openEditorWiselyDocument("/tmp/editor-persist.md");
  await expect(page.getByTestId("editorwisely-editor").locator(".cm-content"))
    .toHaveText("after save", { timeout: 3000 });
});

test("EditorWisely picker reopens in the directory of the last opened file", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  await api.seedLocalText("/tmp/project/src/main.sh", "echo ok");
  await page.getByTestId("local-fs-tool").click();
  await api.openEditorWiselyDocument("/tmp/project/src/main.sh");
  await expect(page.getByTestId("editorwisely-editor").locator(".cm-content"))
    .toHaveText("echo ok", { timeout: 3000 });
  await page.getByRole("button", { name: "Close main.sh" }).click();
  await page.getByTestId("editorwisely-open-document").click();
  await expect(page.getByTestId("local-fs-crumb-src")).toHaveAttribute("title", "/tmp/project/src");
});

test("EditorWisely applies syntax highlighting to shell, Go, and JavaScript files", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  await api.seedLocalText("/tmp/project/main.sh", "#!/bin/sh\nprintf \"%s\" \"$HOME\"");
  await api.seedLocalText("/tmp/project/main.go", "package main\nfunc main() {}");
  await api.seedLocalText("/tmp/project/main.js", "const answer = 42;");
  await page.getByTestId("local-fs-tool").click();
  const editor = page.getByTestId("editorwisely-editor");
  for (const [path, text] of [["/tmp/project/main.sh", "printf"], ["/tmp/project/main.go", "package main"], ["/tmp/project/main.js", "const answer"]]) {
    await api.openEditorWiselyDocument(path);
    await expect(editor.locator(".cm-content")).toContainText(text);
    await expect.poll(() => editor.locator(".cm-content span").count()).toBeGreaterThan(0);
  }
});

test("EditorWisely edits and saves a local UTF-8 file", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  await api.seedLocalText("/tmp/editor-local.js", "const value = 1;\r\n");
  await page.getByTestId("local-fs-tool").click();
  await api.openEditorWiselyDocument("/tmp/editor-local.js");
  await expect(page.getByTestId("editorwisely-editor")).toBeVisible();
  await page.getByTestId("editorwisely-editor").locator(".cm-content").click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.type("const value = 2;");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await api.getLastLocalBytesWrite())?.path).toBe("/tmp/editor-local.js");
  await expect(page.getByTestId("editorwisely-window")).toBeVisible();
});

test("EditorWisely automatically saves a writable local file after typing pauses", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  await api.seedLocalText("/tmp/editor-autosave.txt", "before\n");
  await page.getByTestId("local-fs-tool").click();
  await api.openEditorWiselyDocument("/tmp/editor-autosave.txt");
  const editor = page.getByTestId("editorwisely-editor").locator(".cm-content");
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.type("after");

  await expect.poll(async () => (await api.getLastLocalBytesWrite())?.path, { timeout: 3000 })
    .toBe("/tmp/editor-autosave.txt");
  await expect.poll(async () => (await api.getLastLocalBytesWrite())?.base64)
    .toBe("YWZ0ZXI=");
  await expect(page.locator(".editorwisely-toolbar")).toContainText("Saved");
});

test("EditorWisely keeps an autosave failure visible without retrying the same text", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  await api.seedLocalText("/tmp/editor-autosave-failure.txt", "before");
  await page.getByTestId("local-fs-tool").click();
  await api.openEditorWiselyDocument("/tmp/editor-autosave-failure.txt");
  api.failNextLocalWrite();
  const editor = page.getByTestId("editorwisely-editor").locator(".cm-content");
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.type("after");

  await expect(page.getByRole("alert")).toContainText("Mock local write failed", { timeout: 3000 });
  await page.waitForTimeout(1200);
  await expect(page.getByRole("alert")).toContainText("Mock local write failed", { timeout: 3000 });
  await expect(page.locator(".editorwisely-toolbar")).toContainText("Unsaved changes");
});

test("EditorWisely preserves a failed local edit and offers Save As", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  await api.seedLocalText("/tmp/editor-readonly.txt", "original\n");
  await page.getByTestId("local-fs-tool").click();
  await api.openEditorWiselyDocument("/tmp/editor-readonly.txt");
  await page.getByTestId("editorwisely-editor").locator(".cm-content").click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.type("changed");
  api.failNextLocalWrite();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Mock local write failed");
  await api.setNextDialogSaveResult("/tmp/editor-copy.txt");
  await page.getByTestId("editorwisely-save-as").click();
  await expect.poll(async () => (await api.getLastLocalBytesWrite())?.path).toBe("/tmp/editor-copy.txt");
  await expect(page.locator(".editorwisely-toolbar")).toContainText("/tmp/editor-copy.txt");
});

test("AI Local Dock glyph has a visible tile background", async ({ page }) => {
  await gotoApp(page);
  await (await twE2e(page)).openHome();
  await page.getByTestId("local-fs-tool").click();

  const glyph = page.getByTestId("dock-app-ai-local").locator(".host-desktop-glyph");
  await expect(glyph).toBeVisible();
  await expect.poll(() => glyph.evaluate((element) => getComputedStyle(element).backgroundImage))
    .not.toBe("none");
});

test("Home Desktop opens the existing local chat as AI Local", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  const sshCallsBefore = await api.getCreateSshCallCount();

  await page.getByTestId("ai-engineer-tool").click();
  const homeComposer = page.getByTestId("ai-engineer-composer").locator("textarea");
  await expect(homeComposer).toBeVisible();
  await homeComposer.fill("draft from Home chat");
  await page.getByTestId("local-fs-tool").click();
  await expect(page.getByTestId("desktop-icon-aiLocal")).toBeVisible();
  await expect(page.getByTestId("desktop-icon-aiLinux")).toHaveCount(0);
  await expect(page.getByTestId("host-ai-linux-float")).toHaveCount(0);
  await page.getByTestId("dock-app-ai-local").click();

  const aiLocal = page.getByTestId("home-ai-local-float");
  await expect(aiLocal).toBeVisible();
  await expect(aiLocal.getByTestId("ai-engineer-composer").locator("textarea")).toHaveValue("draft from Home chat");
  expect(await api.getCreateSshCallCount()).toBe(sshCallsBefore);
  await page.getByTestId("home-ai-local-close").click();
  await expect(aiLocal).toHaveCount(0);
  await page.getByTestId("local-fs-tool").click();
  await expect(page.getByTestId("home-local-chat").getByTestId("ai-engineer-composer").locator("textarea")).toHaveValue("draft from Home chat");
});

test("Home desktop terminal continuity", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  const terminal = page.getByTestId("home-local-terminal");
  await expect(terminal).toBeVisible();
  await terminal.evaluate((element) => {
    (window as Window & { __homeTerminalNode?: Element }).__homeTerminalNode = element;
  });

  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-terminal").click();
  const desktopTerminal = page.getByTestId("desktop-terminal-host");
  await expect(desktopTerminal).toBeVisible();
  expect(await desktopTerminal.evaluate((element) =>
    element.querySelector('[data-testid="home-local-terminal"]') ===
      (window as Window & { __homeTerminalNode?: Element }).__homeTerminalNode,
  )).toBe(true);
  await page.getByTestId("host-terminal-close").click();
  expect(await page.getByTestId("home-local-terminal").evaluate((element) =>
    element === (window as Window & { __homeTerminalNode?: Element }).__homeTerminalNode,
  )).toBe(true);

});

test("Home Desktop omits the native Files app", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await expect(page.getByTestId("dock-app-files")).toHaveCount(0);
});

test("Home MarkWisely creates, saves, and reopens local Markdown", async ({ page }) => {
  await gotoApp(page);
  await (await twE2e(page)).openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-new-document").click();
  await page.getByTestId("markwisely-use-folder").click();
  await page.getByTestId("markwisely-file-name").fill("local-note.md");
  await page.getByTestId("markwisely-create-submit").click();
  await expect(page.getByTestId("markwisely-editor-view")).toBeVisible();
  const editor = page.locator(".vditor-ir");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type("# Local note");
  await expect(page.getByTestId("markwisely-save-status")).toContainText(/Saved|已保存/, { timeout: 10_000 });
  await expect(page.getByTestId("markwisely-save-status")).toBeHidden({ timeout: 3000 });
  await expect(page.getByTestId("markwisely-save")).toHaveCount(0);
  await expect(page.getByTestId("markwisely-save-status")).toBeHidden();
  await expect(page.getByRole("button", { name: /All files|全部文件/i })).toHaveCount(0);
  await page.getByTestId("markwisely-close").click();
  await expect(page.getByTestId("markwisely-panel")).toHaveCount(0);
  await page.getByTestId("dock-app-markwisely").click();
  await expect(page.getByTestId("markwisely-home")).toBeVisible();
  await expect(page.getByTestId("markwisely-recent").filter({ hasText: "local-note.md" })).toBeVisible();
  await page.getByTestId("markwisely-recent").filter({ hasText: "local-note.md" }).click();
  await expect(editor).toContainText("Local note");
});

test("Home MarkWisely keeps Markdown readable after repeated maximize and restore", async ({ page }) => {
  await gotoApp(page);
  await (await twE2e(page)).openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-new-document").click();
  await page.getByTestId("markwisely-use-folder").click();
  await page.getByTestId("markwisely-file-name").fill("zoom-layout.md");
  await page.getByTestId("markwisely-create-submit").click();

  const panel = page.getByTestId("markwisely-panel");
  const editor = panel.locator(".vditor-ir .vditor-reset[contenteditable='true']");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type("# Markdown stays readable\n\nA paragraph after repeated window resizing.");
  await expect(editor).toContainText("Markdown stays readable");

  const maximize = page.getByTestId("markwisely-maximize");
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await maximize.click();
    await expect(panel).toHaveAttribute("data-maximized", "true");
    if (cycle === 1) {
      const constrainedWidth = await editor.evaluate((element) => {
        (element as HTMLElement).style.width = "18px";
        return element.getBoundingClientRect().width;
      });
      expect(constrainedWidth).toBeGreaterThan(400);
    }
    await expect.poll(() => editor.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(400);
    await expect(editor.locator("h1")).toContainText("Markdown stays readable");
    await maximize.click();
    await expect(panel).toHaveAttribute("data-maximized", "false");
    await expect.poll(() => editor.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(400);
    await expect(editor.locator("h1")).toContainText("Markdown stays readable");
  }
});

test("Home Desktop omits the native Processes app", async ({ page }) => {
  await gotoApp(page);
  await (await twE2e(page)).openHome();
  await page.getByTestId("local-fs-tool").click();
  await expect(page.getByTestId("dock-app-processes")).toHaveCount(0);
});
