import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("AI Engineer chat", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openAiChat();
  });

  test("opens chat composer with model picker", async ({ page }) => {
    await expect(page.getByTestId("ai-engineer-platform-toggle")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator(".ai-engineer-composer")).toBeVisible({ timeout: 20_000 });
  });

  test("platform toggle opens platform panel", async ({ page }) => {
    await page.getByTestId("ai-engineer-platform-toggle").click();
    await expect(page.getByTestId("ai-engineer-platform-panel")).toBeVisible();
  });
});
