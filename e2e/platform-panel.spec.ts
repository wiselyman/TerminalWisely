import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("AI Platform panel (browser E2E + live sidecar)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openAiPlatform();
    await expect(page.getByTestId("ai-engineer-platform-panel")).toBeVisible({
      timeout: 45_000,
    });
  });

  test("shows MCP servers section", async ({ page }) => {
    await expect(page.getByTestId("ai-engineer-platform-panel")).toContainText(
      /MCP|数据源|Servers/i,
    );
  });

  test("lists k8s skills in platform view", async ({ page }) => {
    await expect(page.getByTestId("ai-engineer-platform-panel")).toContainText(
      /k8s|Skills|技能/i,
    );
  });

  test("memory search accepts query", async ({ page }) => {
    const input = page.getByTestId("ai-engineer-platform-panel").locator("input").first();
    await input.fill("ImagePullBackOff");
    await page
      .getByTestId("ai-engineer-platform-panel")
      .getByRole("button", { name: /Search|搜索/i })
      .click();
    await expect(page.getByTestId("ai-engineer-platform-panel")).toBeVisible();
  });

  test("Run eval completes with all scenarios passed", async ({ page }) => {
    await page.getByTestId("ai-engineer-eval-run").click();
    await expect(page.getByTestId("ai-engineer-eval-summary")).toBeVisible({
      timeout: 90_000,
    });
    const summary = await page.getByTestId("ai-engineer-eval-summary").innerText();
    expect(summary).toMatch(/8\s*\/\s*8|100\s*%|passed|通过/i);
    await expect(page.getByTestId("ai-engineer-eval-results").locator("li.is-pass")).toHaveCount(
      8,
      { timeout: 5_000 },
    );
  });

  test("platform toggle switches to chat and back", async ({ page }) => {
    await page.getByTestId("ai-engineer-platform-toggle").click();
    await expect(page.getByTestId("ai-engineer-platform-panel")).toHaveCount(0);
    await page.getByTestId("ai-engineer-platform-toggle").click();
    await expect(page.getByTestId("ai-engineer-platform-panel")).toBeVisible();
  });
});
