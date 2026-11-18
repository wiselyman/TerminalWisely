import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("SSH connection UI", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
  });

  test("ungrouped hosts start expanded and new host can pick a group", async ({ page }) => {
    await page.getByTestId("chrome-new-session").click();
    const group = page.getByTestId("ssh-host-group");
    await expect(group).toBeVisible();
    await expect(group).toHaveValue("__ungrouped__");
    await expect(group.locator("option").first()).toHaveText(/未分组|Ungrouped/);
  });

  test("saved connection click triggers SSH connect invoke", async ({ page }) => {
    const api = await twE2e(page);
    await api.openHomeDirectory();
    await page.getByTestId("home-host-card-e2e-conn-1").click();
    await expect.poll(async () => api.getCreateSshCallCount()).toBeGreaterThan(0);
    await expect(page.getByTestId("host-desktop-panel")).toBeVisible();
    const req = await api.getLastCreateSsh();
    expect(req).toBeTruthy();
  });
});
