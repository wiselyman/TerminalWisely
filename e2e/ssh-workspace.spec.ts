import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("SSH terminal workspace", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
  });

  test("shows terminal view for mock session", async ({ page }) => {
    await expect(page.getByTestId("terminal-view")).toBeVisible({ timeout: 15_000 });
  });

  test("displays mocked shell prompt", async ({ page }) => {
    await expect(page.getByTestId("terminal-view")).toBeVisible({ timeout: 15_000 });
    const api = await twE2e(page);
    await api.emitTerminalPrompt("e2e@127.0.0.1:~$ ");
    await expect(page.locator(".xterm-rows")).toContainText(/e2e@127.0.0.1/, {
      timeout: 15_000,
    });
  });

  test("shows saved connection in hosts sidebar", async ({ page }) => {
    await expect(page.getByRole("button", { name: /E2E Test Host/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /E2E Test Host/i })).toContainText(/127\.0\.0\.1/);
  });
});
