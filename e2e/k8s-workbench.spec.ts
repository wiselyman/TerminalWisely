import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("K8s workbench", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openK8sWorkbench();
  });

  test("renders workbench with cluster name", async ({ page }) => {
    await expect(page.locator(".k8s-workbench")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".k8s-workbench")).toContainText(/e2e-k3s-local/i);
  });

  test("lists pods including running and pending", async ({ page }) => {
    await expect(page.locator(".k8s-workbench")).toContainText(/web-abc/i);
    await expect(page.locator(".k8s-workbench")).toContainText(/broken-pull/i);
    await expect(page.locator(".k8s-workbench")).toContainText(/Running|Pending/i);
  });

  test("namespace selector includes demo", async ({ page }) => {
    await expect(page.locator(".k8s-workbench-ns")).toContainText(/demo/i);
  });

  test("can open AI engineer from titlebar", async ({ page }) => {
    await page.getByTestId("ai-engineer-tool").click();
    await expect(page.getByTestId("ai-engineer-platform-toggle")).toBeVisible({
      timeout: 20_000,
    });
  });
});
