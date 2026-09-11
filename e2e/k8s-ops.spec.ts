import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("K8s day-2 ops", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openK8sWorkbench();
  });

  test("rollout restart invokes k8s_rollout_restart", async ({ page }) => {
    const api = await twE2e(page);
    await api.setK8sCategory("deployments");
    await expect(page.locator(".k8s-workbench")).toContainText(/web/i);

    const row = page.locator(".k8s-workbench tr", { hasText: "web" }).first();
    await row.click();
    await page.getByTestId("k8s-action-restart").click();
    await page.locator(".modal .find-panel-run.primary").click();

    await expect
      .poll(async () => api.getLastK8sRolloutRestart(), { timeout: 15_000 })
      .not.toBeNull();
    const last = await api.getLastK8sRolloutRestart();
    expect(String(last?.kind ?? "")).toMatch(/Deployment/i);
    expect(String(last?.name ?? "")).toMatch(/web/i);
  });

  test("helm install invokes k8s_helm_install", async ({ page }) => {
    const api = await twE2e(page);
    await api.setK8sCategory("helm_charts");
    await expect(page.locator(".k8s-workbench")).toContainText(/stable\/nginx/i);

    const row = page.locator(".k8s-workbench tr", { hasText: "stable/nginx" }).first();
    await row.click();
    await page.getByTestId("k8s-action-helm-install").click();
    const installConfirm = page.locator(".modal .find-panel-run.primary");
    await expect(installConfirm).toBeVisible();
    await installConfirm.click();

    await expect
      .poll(async () => api.getLastK8sHelmInstall(), { timeout: 15_000 })
      .not.toBeNull();
    const last = await api.getLastK8sHelmInstall();
    expect(JSON.stringify(last)).toMatch(/nginx/i);
  });

  test("terminal toolbar opens embedded cluster shell", async ({ page }) => {
    await page.getByTestId("k8s-nav-terminal").click();
    await expect(page.getByTestId("k8s-workbench-dock")).toBeVisible();
    await expect(page.getByTestId("k8s-cluster-terminal").last()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("k8s-dock-context")).toContainText(/e2e-context/i);
  });

  test("delete owned pod offers controller delete via k8s_delete_resource", async ({
    page,
  }) => {
    const api = await twE2e(page);
    await api.setK8sCategory("pods");
    await expect(page.locator(".k8s-workbench")).toContainText(/web-abc/i);

    const row = page.locator(".k8s-workbench tr", { hasText: "web-abc" }).first();
    await row.click();
    await page.getByTestId("k8s-action-delete").click();
    await expect(page.getByTestId("k8s-delete-owned-warn")).toBeVisible();
    await page.getByTestId("k8s-confirm-delete-owner").click();

    await expect
      .poll(async () => api.getLastK8sDelete(), { timeout: 15_000 })
      .not.toBeNull();
    const last = await api.getLastK8sDelete();
    expect(String(last?.kind ?? "")).toMatch(/^StatefulSet$/i);
    expect(String(last?.name ?? "")).toMatch(/my-statefulset/i);
    expect(String(last?.namespace ?? "")).toMatch(/demo/i);
  });

  test("terminal session from nav footer opens second tab", async ({ page }) => {
    await page.getByTestId("k8s-nav-terminal").click();
    await expect(page.getByTestId("k8s-detail-tablist")).toBeVisible();
    await page.getByTestId("k8s-nav-terminal").click();
    await expect(page.getByTestId("k8s-detail-tablist")).toContainText(/Terminal 2|终端 2/i);
    await expect(page.getByTestId("k8s-workbench-dock")).toBeVisible();
    await expect(page.getByTestId("k8s-cluster-terminal").last()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("repeated nav clicks open multiple create resource tabs", async ({ page }) => {
    await page.getByTestId("k8s-nav-create-resource").click();
    await page.getByTestId("k8s-nav-create-resource").click();
    await expect(page.getByTestId("k8s-detail-tablist")).toContainText(
      /Create resource 2|创建资源 2/i,
    );
  });

  test("opening two pods keeps both resource tabs", async ({ page }) => {
    const api = await twE2e(page);
    await api.setK8sCategory("pods");
    await expect(page.locator(".k8s-workbench")).toContainText(/web-abc/i);
    const rows = page.locator(".k8s-workbench tbody tr");
    await rows.nth(0).click();
    const count = await rows.count();
    if (count >= 2) {
      await rows.nth(1).click();
    } else {
      // Same list click twice should not duplicate; switch category and back with second select via store is covered in unit tests.
      await api.setK8sCategory("services");
      await expect(page.locator(".k8s-workbench")).toContainText(/web/i);
      await page.locator(".k8s-workbench tr", { hasText: "web" }).first().click();
    }
    await expect(
      page.getByTestId("k8s-detail-tablist").locator(".k8s-detail-tab--resource"),
    ).toHaveCount(2);
  });

  test("pod overview shows volume groups", async ({ page }) => {
    const api = await twE2e(page);
    await api.setK8sCategory("pods");
    await expect(page.locator(".k8s-workbench")).toContainText(/web-abc/i);
    await page.locator(".k8s-workbench tr", { hasText: "web-abc" }).first().click();
    await expect(page.getByTestId("k8s-overview-volumes")).toBeVisible();
    await expect(
      page.getByTestId("k8s-overview-volume-group-persistentVolumeClaim"),
    ).toBeVisible();
    await expect(
      page.getByTestId("k8s-overview-volume-group-emptyDir"),
    ).toBeVisible();
  });

  test("pod detail exposes multiport forward rows", async ({ page }) => {
    const api = await twE2e(page);
    await api.setK8sCategory("pods");
    await expect(page.locator(".k8s-workbench")).toContainText(/web-abc/i);
    await page.locator(".k8s-workbench tr", { hasText: "web-abc" }).first().click();
    await expect(page.getByTestId("k8s-detail-tab-port-forward")).toBeVisible();
    await page.getByTestId("k8s-detail-tab-port-forward").click();
    await expect(page.getByTestId("k8s-port-forward-pane")).toBeVisible();
    await expect(page.getByTestId("k8s-port-forward-row-80")).toBeVisible();
    await expect(page.getByTestId("k8s-port-forward-row-443")).toBeVisible();
    await expect(page.getByTestId("k8s-port-forward-start-80")).toBeVisible();
    await expect(page.getByTestId("k8s-port-forward-start")).toBeVisible();
  });

  test("create resource opens yaml tab and applies", async ({ page }) => {
    const api = await twE2e(page);
    await page.getByTestId("k8s-nav-create-resource").click();
    await expect(page.getByTestId("k8s-detail-tablist")).toContainText(
      /Create resource|创建资源/i,
    );
    await expect(page.getByTestId("k8s-create-resource-yaml")).toBeVisible();
    await page.getByTestId("k8s-create-resource-apply").click();
    await expect
      .poll(async () => api.getLastK8sApply(), { timeout: 15_000 })
      .not.toBeNull();
    const last = await api.getLastK8sApply();
    expect(String(last?.yaml ?? "")).toContain("ConfigMap");
  });
});
