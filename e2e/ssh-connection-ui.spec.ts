import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("SSH connection UI", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
  });

  test("saved connection click triggers SSH connect invoke", async ({ page }) => {
    await page.getByRole("button", { name: /E2E Test Host/i }).click();
    const api = await twE2e(page);
    await expect.poll(async () => api.getCreateSshCallCount()).toBeGreaterThan(0);
    const req = await api.getLastCreateSsh();
    expect(req).toBeTruthy();
  });
});
