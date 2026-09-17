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
