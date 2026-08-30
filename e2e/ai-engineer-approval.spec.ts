import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("AI approval flow", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openSshTab();
    await api.openAiChatForSsh();
    await expect(page.getByTestId("ai-engineer-platform-toggle")).toBeVisible({
      timeout: 20_000,
    });
  });

  test("shows approval card and approves command", async ({ page }) => {
    const api = await twE2e(page);
    await api.simulateApproval("echo approval-e2e");
    await expect(page.getByTestId("ai-engineer-approval-card")).toBeVisible();
    await page.getByTestId("ai-engineer-approval-approve").click();
    await expect(page.getByTestId("ai-engineer-approval-card")).toHaveClass(/is-resolved/);
  });

  test("reject clears pending approval", async ({ page }) => {
    const api = await twE2e(page);
    await api.simulateApproval("rm -rf /");
    await page.getByTestId("ai-engineer-approval-reject").click();
    await expect(page.getByTestId("ai-engineer-approval-card")).toHaveClass(/is-resolved/);
  });
});
