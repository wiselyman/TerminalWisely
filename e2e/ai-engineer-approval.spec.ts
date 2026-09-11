import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

async function expectAiPanelAlive(page: import("@playwright/test").Page) {
  await expect(page.getByText("界面渲染出错")).toHaveCount(0);
  await expect(page.getByText("Can't find variable")).toHaveCount(0);
  await expect(page.getByTestId("ai-engineer-composer")).toBeVisible();
}

test.describe("AI approval flow", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openSshTab();
    await api.openAiChatForSsh();
    await expect(page.getByTestId("ai-engineer-composer")).toBeVisible({
      timeout: 20_000,
    });
  });

  test("shows approval card and approves once without crashing panel", async ({
    page,
  }) => {
    const api = await twE2e(page);
    await api.simulateApproval("echo approval-e2e");
    await expect(page.getByTestId("ai-engineer-approval-card")).toBeVisible();
    await expect(page.getByTestId("ai-engineer-approval-once")).toBeVisible();
    await expect(page.getByTestId("ai-engineer-approval-session")).toBeVisible();
    await page.getByTestId("ai-engineer-approval-once").click();
    await expect(page.getByTestId("ai-engineer-approval-card")).toHaveClass(
      /is-resolved/,
    );
    // Optimistic exec card closes the “approved but starting…” ambiguity.
    await expect(page.getByTestId("ai-engineer-exec-live")).toBeVisible();
    // Clearing pendingApproval runs reset useEffect — must not ReferenceError.
    await expectAiPanelAlive(page);
  });

  test("session remember clears pending without crashing panel", async ({
    page,
  }) => {
    const api = await twE2e(page);
    await api.simulateApproval("touch /tmp/session-allow");
    await page.getByTestId("ai-engineer-approval-session").click();
    await expect(page.getByTestId("ai-engineer-approval-card")).toHaveClass(
      /is-resolved/,
    );
    await expectAiPanelAlive(page);
  });

  test("reject clears pending approval without crashing panel", async ({
    page,
  }) => {
    const api = await twE2e(page);
    await api.simulateApproval("rm -rf /");
    await page.getByTestId("ai-engineer-approval-reject").click();
    await expect(page.getByTestId("ai-engineer-approval-card")).toHaveClass(
      /is-resolved/,
    );
    await expectAiPanelAlive(page);
  });
});
