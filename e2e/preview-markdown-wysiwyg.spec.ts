import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("Markdown WYSIWYG preview", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openSshTab();
  });

  test("markdown opens in wysiwyg by default", async ({ page }) => {
    const api = await twE2e(page);
    await api.openMarkdownPreview("/home/e2e/docs/note.md");
    await expect(page.getByTestId("preview-markdown-wysiwyg")).toBeVisible({
      timeout: 30_000,
    });
    const panel = page.locator(".preview-float-window");
    const tabs = panel.getByRole("tablist", { name: "Open files for this connection" });
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole("tab", { name: /note\.md/ })).toHaveAttribute("aria-selected", "true");
    await expect(panel.locator(".preview-panel-title")).toHaveCount(0);
    await expect(page.locator(".preview-dock")).toHaveCount(0);

    await panel.getByRole("button", { name: "Minimize" }).click();
    const dock = page.locator(".preview-dock");
    await expect(dock).toBeVisible();
    await dock.getByRole("tab", { name: /note\.md/ }).locator(".preview-dock-tab-main").click();
    await expect(page.locator(".preview-float-window")).toBeVisible();
  });

  test("window close closes every Markdown document while tab close stays scoped", async ({ page }) => {
    const api = await twE2e(page);
    await api.openMarkdownPreview("/home/e2e/docs/note.md");
    await api.openMarkdownPreview("/home/e2e/docs/related.md");
    const panel = page.locator(".preview-float-window");
    const tabs = panel.getByRole("tablist", { name: "Open files for this connection" });
    await expect(tabs.getByRole("tab")).toHaveCount(2);

    await tabs.getByRole("tab", { name: /note\.md/ }).locator(".preview-dock-tab-close").click();
    await expect(panel).toBeVisible();
    await expect(tabs.getByRole("tab")).toHaveCount(1);
    await expect(tabs.getByRole("tab", { name: /related\.md/ })).toBeVisible();

    await api.openMarkdownPreview("/home/e2e/docs/note.md");
    await expect(tabs.getByRole("tab")).toHaveCount(2);

    await panel.locator('.preview-toolbar-icon[aria-label="Close"]').click();
    await expect(panel).toHaveCount(0);
    await expect(page.locator(".preview-dock")).toHaveCount(0);
  });

  test("Markdown preview can show its Markdown tree and open another document", async ({ page }) => {
    const api = await twE2e(page);
    await api.openMarkdownPreview("/home/e2e/selected.md");
    const panel = page.locator(".preview-float-window");

    const treeToggle = panel.getByTestId("preview-markdown-tree-toggle");
    await expect(treeToggle).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByTestId("preview-markdown-tree")).toHaveCount(0);
    await treeToggle.click();
    const tree = panel.getByTestId("preview-markdown-tree");
    await expect(tree).toBeVisible();
    await expect(tree.getByTestId("markwisely-sidebar-file").filter({ hasText: "guide.md" })).toBeVisible();
    await tree.getByTestId("markwisely-sidebar-file").filter({ hasText: "guide.md" }).click();
    await expect(panel.getByRole("tab", { name: /guide\.md/ })).toHaveAttribute("aria-selected", "true");
  });

  test("Markdown preview outline follows the active document and jumps to headings", async ({ page }) => {
    const api = await twE2e(page);
    await api.openMarkdownPreview("/home/e2e/docs/note.md");
    const panel = page.locator(".preview-float-window");
    await expect(panel.locator(".vditor-ir")).toBeVisible({ timeout: 30_000 });

    const outlineToggle = panel.getByTestId("preview-markdown-outline-toggle");
    await expect(outlineToggle).toBeVisible();
    await expect(panel.getByTestId("preview-markdown-outline")).toHaveCount(0);
    await outlineToggle.click();
    const outline = panel.getByTestId("preview-markdown-outline");
    await expect(outline).toBeVisible();
    const heading = outline.getByTestId("markwisely-outline-heading").filter({ hasText: "E2E Markdown" });
    await expect(heading).toBeVisible();
    await heading.click();
    await expect(heading).toHaveAttribute("aria-current", "location");
  });

  test("non-Markdown previews do not show Markdown tree or outline controls", async ({ page }) => {
    const api = await twE2e(page);
    await api.openMarkdownPreview("/home/e2e/readme.txt");
    const panel = page.locator(".preview-float-window");
    await expect(panel.getByRole("tab", { name: /readme\.txt/ })).toHaveAttribute("aria-selected", "true");
    await expect(panel.getByTestId("preview-markdown-tree-toggle")).toHaveCount(0);
    await expect(panel.getByTestId("preview-markdown-outline-toggle")).toHaveCount(0);
  });

  test("maximized Markdown content expands to the available width without a blue resize corner", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await twE2e(page);
    await api.openMarkdownPreview("/home/e2e/docs/note.md");
    const panel = page.locator(".preview-float-window");
    await expect(panel.locator(".vditor-ir")).toBeVisible({ timeout: 30_000 });
    const resizeCorner = panel.locator(".preview-float-resizer");
    const cornerDisplay = await resizeCorner.evaluate((element) => getComputedStyle(element, "::after").display);
    expect(cornerDisplay).toBe("none");
    await panel.getByRole("button", { name: "Maximize" }).click();

    await expect.poll(async () => panel.locator(".vditor-ir .vditor-reset").evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(1200);
    const editorWidths = await panel.evaluate((element) => Object.fromEntries(
      [".preview-markdown-wysiwyg", ".preview-markdown-wysiwyg-host", ".vditor", ".vditor-content", ".vditor-ir", ".vditor-ir .vditor-reset"]
        .map((selector) => {
          const node = element.querySelector<HTMLElement>(selector)!;
          return [selector, {
            rect: node.getBoundingClientRect().width,
            inline: node.style.width,
            computed: getComputedStyle(node).width,
            maxWidth: getComputedStyle(node).maxWidth,
          }];
        }),
    ));
    const hostWidth = editorWidths[".preview-markdown-wysiwyg-host"].rect;
    const contentWidth = editorWidths[".vditor-ir .vditor-reset"].rect;
    expect(contentWidth, JSON.stringify(editorWidths)).toBeGreaterThan(hostWidth * 0.75);

    await panel.getByRole("button", { name: "Restore" }).click();
    await expect.poll(async () => panel.locator(".vditor-ir .vditor-reset").evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(hostWidth);
  });

  test("does not show the WYSIWYG search hint in the title row", async ({ page }) => {
    const api = await twE2e(page);
    await api.openMarkdownPreview("/home/e2e/docs/links.md");
    const panel = page.locator(".preview-float-window");
    await expect(panel.locator(".vditor-ir")).toBeVisible({ timeout: 30_000 });
    await expect(panel.locator(".preview-wysiwyg-search-hint")).toHaveCount(0);
  });

  test("relative Markdown links open a new preview tab and keep the source available", async ({ page }) => {
    const api = await twE2e(page);
    await api.openMarkdownPreview("/home/e2e/docs/links.md");
    const panel = page.locator(".preview-float-window");
    await expect(panel.locator(".vditor-ir")).toBeVisible({ timeout: 30_000 });
    await panel.locator('.vditor-ir [data-type="a"]').filter({ hasText: "Related document" }).click();

    const tabs = panel.getByRole("tablist", { name: "Open files for this connection" });
    await expect(tabs).toBeVisible();
    await expect(page.locator(".preview-dock")).toHaveCount(0);
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    await expect(tabs.getByRole("tab", { name: /links\.md/ })).toHaveAttribute("aria-selected", "false");
    await expect(tabs.getByRole("tab", { name: /related\.md/ })).toHaveAttribute("aria-selected", "true");

    await tabs.getByRole("tab", { name: /links\.md/ }).locator(".preview-dock-tab-main").click();
    await panel.locator('.vditor-ir [data-type="a"]').filter({ hasText: "Jump to details" }).click();
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    await expect(tabs.getByRole("tab", { name: /links\.md/ })).toHaveAttribute("aria-selected", "true");
    await tabs.getByRole("tab", { name: /links\.md/ }).locator(".preview-dock-tab-close").click();
    await expect(tabs.getByRole("tab")).toHaveCount(1);
    await expect(tabs.getByRole("tab", { name: /related\.md/ })).toHaveAttribute("aria-selected", "true");
  });

  test("source toggle round-trips without losing body text", async ({ page }) => {
    const api = await twE2e(page);
    await api.openMarkdownPreview("/home/e2e/docs/note.md");
    const panel = page.locator(".preview-float-window");
    await expect(page.getByTestId("preview-markdown-wysiwyg")).toBeVisible({
      timeout: 30_000,
    });
    // Wait until Vditor IR content is actually mounted (assets loaded).
    await expect(panel.locator(".vditor-ir")).toBeVisible({ timeout: 30_000 });

    await panel.getByRole("button", { name: "Source" }).click();
    await expect(panel.getByRole("button", { name: "Source" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const source = panel.locator("textarea.preview-text-editor");
    await expect(source).toBeVisible();
    await expect(source).toHaveValue(/UNIQUE_WYSIWYG_MARKER_42/);

    await panel.getByRole("button", { name: "WYSIWYG" }).click();
    await expect(page.getByTestId("preview-markdown-wysiwyg")).toBeVisible();
    await expect(panel.locator(".vditor-ir")).toContainText("UNIQUE_WYSIWYG_MARKER_42");
  });
});
