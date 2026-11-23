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

    const tabs = page.getByRole("tablist", { name: "Open files for this connection" });
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    await expect(tabs.getByRole("tab", { name: /links\.md/ })).toHaveAttribute("aria-selected", "false");
    await expect(tabs.getByRole("tab", { name: /related\.md/ })).toHaveAttribute("aria-selected", "true");
    await expect(panel.locator(".preview-panel-title")).toContainText("related.md");

    await tabs.getByRole("tab", { name: /links\.md/ }).locator(".preview-dock-tab-main").click();
    await panel.locator('.vditor-ir [data-type="a"]').filter({ hasText: "Jump to details" }).click();
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    await expect(tabs.getByRole("tab", { name: /links\.md/ })).toHaveAttribute("aria-selected", "true");
    await expect(panel.locator(".preview-panel-title")).toContainText("links.md");
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
