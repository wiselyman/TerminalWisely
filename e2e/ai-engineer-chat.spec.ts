import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("AI Engineer chat", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openAiChat();
  });

  test("opens chat composer with model picker", async ({ page }) => {
    await expect(page.getByTestId("ai-engineer-composer")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator(".ai-engineer-composer")).toBeVisible({ timeout: 20_000 });
  });

  test("model settings has no agent CLI block", async ({ page }) => {
    await page.getByTestId("ai-engineer-model-picker").click();
    await expect(page.getByTestId("ai-engineer-model-menu")).toBeVisible();
    await page.getByTestId("ai-engineer-manage-models").click();
    const dialog = page.locator(".ai-engineer-settings");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("ai-engineer-cursor-runtime")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /新建|New/ })).toBeVisible();
    await dialog.getByRole("button", { name: /完成|Done/ }).click();
    await expect(dialog).toBeHidden();
    await page.getByTestId("ai-engineer-model-picker").click();
    await page.getByTestId("ai-engineer-picker-tab-agent").click();
    await expect(page.getByTestId("ai-engineer-picker-panel-agent")).toBeVisible();
  });

  test("unconfigured picker offers a model or an agent", async ({ page }) => {
    const api = await twE2e(page);
    await api.clearAiModelConfig();
    await expect(page.getByTestId("ai-engineer-model-picker")).toContainText(
      /选择大模型或agent|Choose a model or agent/,
    );
  });

  test("url pasted into API key is not sent as the secret", async ({ page }) => {
    await page.getByTestId("ai-engineer-model-picker").click();
    await page.getByTestId("ai-engineer-manage-models").click();
    const dialog = page.locator(".ai-engineer-settings");
    await dialog.getByRole("button", { name: /新建|New/ }).click();
    await dialog.getByRole("button", { name: /OpenAI 兼容|OpenAI compatible/ }).click();
    await dialog.locator("input").nth(1).fill("https://api.deepseek.com");
    await page.getByTestId("ai-model-api-key").fill("https://api.deepseek.com");
    await expect(dialog).toContainText(/API Key 里填的是网址|API Key is a web address/);
    await dialog.getByRole("button", { name: /刷新模型列表|Refresh model/ }).click();
    await expect(dialog).not.toContainText("Authentication Fails");
    await expect(dialog).toContainText(/API Key 里填的是网址|API Key is a web address/);
  });
});
