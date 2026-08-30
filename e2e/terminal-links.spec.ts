import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("Terminal path actions", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openSshTab();
  });

  test("enter_directory invoke records remote path", async ({ page }) => {
    const api = await twE2e(page);
    await api.invokeEnterDirectory("/var/log");
    const req = await api.getLastEnterDirectory();
    expect(req?.remote_path).toBe("/var/log");
  });

  test("preview_open invoke records file path", async ({ page }) => {
    const api = await twE2e(page);
    await api.invokePreviewOpen("/var/log/app.log");
    const req = await api.getLastPreviewOpen();
    expect(req?.path).toBe("/var/log/app.log");
  });
});
