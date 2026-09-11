import { expect, test } from "@playwright/test";
import { expandUngroupedEntities, gotoApp, twE2e } from "./tw-e2e";

test.describe("K8s workbench", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openK8sWorkbench();
  });

  test("k8s sidebar shows cluster status bar not host cpu bar", async ({
    page,
  }) => {
    await expect(page.getByTestId("k8s-cluster-statusbar")).toBeVisible();
    await expect(page.getByTestId("k8s-statusbar-name")).toBeVisible();
    await expect(page.getByTestId("k8s-statusbar-nodes")).toBeVisible();
    await expect(
      page.locator(".host-stats-statusbar:not(.k8s-cluster-statusbar)"),
    ).toHaveCount(0);
  });

  test("renders workbench with cluster name on tab", async ({ page }) => {
    await expect(page.locator(".k8s-workbench")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("tab", { name: /Kubernetes/i }).click();
    await expandUngroupedEntities(page);
    await expect(page.locator(".saved-item-main", { hasText: "e2e-k3s-local" })).toBeVisible();
    const clusterTab = page.locator('[data-tab-role="k8s-cluster"]');
    await expect(clusterTab).toBeVisible();
    await expect(clusterTab.getByTestId("k8s-cluster-tab-title")).toHaveText(
      "e2e-k3s-local",
    );
  });

  test("shows embedded terminal in detail tabs", async ({ page }) => {
    await page.getByTestId("k8s-nav-terminal").click();
    await expect(page.getByTestId("k8s-detail-tablist")).toBeVisible();
    await expect(page.getByTestId("k8s-workbench-dock")).toBeVisible();
  });

  test("lists pods including running and pending", async ({ page }) => {
    await expect(page.locator(".k8s-workbench")).toContainText(/web-abc/i);
    await expect(page.locator(".k8s-workbench")).toContainText(/broken-pull/i);
    await expect(page.locator(".k8s-workbench")).toContainText(/Running|Pending/i);
  });

  test("namespace selector includes demo", async ({ page }) => {
    const picker = page.getByTestId("k8s-namespace-picker");
    await expect(picker).toContainText(/demo/i);
    await picker.click();
    const menu = page.getByTestId("k8s-namespace-picker-menu");
    await expect(menu).toBeVisible();
    await expect(menu).toContainText(/All namespaces|全部命名空间/i);
    await expect(menu).toContainText(/demo/i);
  });

  test("can open AI engineer from titlebar", async ({ page }) => {
    await page.getByTestId("ai-engineer-tool").click();
    await expect(page.getByTestId("ai-engineer-composer")).toBeVisible({
      timeout: 20_000,
    });
  });
});
