import { expect, test } from "@playwright/test";
import { expandUngroupedEntities, gotoApp, twE2e } from "./tw-e2e";

test.describe("SSH connection UI", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
  });

  test("ungrouped hosts start expanded and new host can pick a group", async ({ page }) => {
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();
    const ungrouped = page.getByTestId("entity-group-__ungrouped__");
    await expect(ungrouped).toBeVisible();
    await expect(ungrouped.locator(".entity-group-collapse")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await page.getByTestId("entity-add-item-hosts").click();
    const group = page.getByTestId("ssh-host-group");
    await expect(group).toBeVisible();
    await expect(group).toHaveValue("__ungrouped__");
    await expect(group.locator("option").first()).toHaveText(/未分组|Ungrouped/);
  });

  test("saved connection click triggers SSH connect invoke", async ({ page }) => {
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();
    await expandUngroupedEntities(page);
    await page.getByRole("button", { name: /^E2E Test Host$/i }).click();
    const api = await twE2e(page);
    await expect.poll(async () => api.getCreateSshCallCount()).toBeGreaterThan(0);
    const req = await api.getLastCreateSsh();
    expect(req).toBeTruthy();
  });
});
