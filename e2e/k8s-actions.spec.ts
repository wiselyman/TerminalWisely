import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("K8s workbench actions", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openK8sWorkbench();
  });

  test("pod row is visible and selectable", async ({ page }) => {
    await expect(page.locator(".k8s-workbench")).toContainText(/web-abc/i);
    await page.locator(".k8s-workbench").getByText(/web-abc/i).first().click();
    await expect(page.locator(".k8s-workbench")).toBeVisible();
  });

  test("apply yaml invokes k8s_apply_yaml", async ({ page }) => {
    const api = await twE2e(page);
    const yaml =
      "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: tw-e2e\n  namespace: demo\ndata:\n  k: v\n";
    await api.invokeK8sApplyYaml(yaml);
    const apply = await api.getLastK8sApply();
    expect(apply?.yaml).toContain("ConfigMap");
  });
});
