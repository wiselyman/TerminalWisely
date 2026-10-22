import { expect, test } from "@playwright/test";
import { expandUngroupedEntities, gotoApp, twE2e } from "./tw-e2e";

test.describe("App shell & welcome", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openHome();
  });

  test("Home hides the sidebar and gives the full left pane to Terminal", async ({ page }) => {
    const api = await twE2e(page);
    await api.resetMocks();
    await expect(page.locator(".sidebar-shell")).toBeHidden();
    const terminalBounds = await page.locator(".home-local-terminal-pane").boundingBox();
    expect(terminalBounds?.x).toBe(0);
    await page.getByTestId("sidebar-view-hosts").click();
    await expect(page.locator(".sidebar-shell")).toBeVisible();
    await expect(page.getByTestId("home-local-chat")).toHaveCount(0);
    await expandUngroupedEntities(page);
    await expect(page.getByRole("button", { name: "E2E Test Host" })).toBeVisible();
    await page.locator('[data-tab-role="home"]').click();
    await expect(page.locator(".sidebar-shell")).toBeHidden();
    await expect(page.getByRole("button", { name: "E2E Test Host" })).toHaveCount(0);
  });

  test("shows the local home chat", async ({ page }) => {
    const home = page.getByTestId("home-local-chat");
    await expect(home).toBeVisible();
    await expect(home.getByTestId("home-local-empty")).toBeVisible();
    await expect(home.getByTestId("ai-engineer-composer")).toBeVisible();
    await expect(page.getByTestId("workspace-welcome")).toHaveCount(0);
  });

  test("switches locale en ↔ zh-CN", async ({ page }) => {
    await page.getByTestId("locale-switcher-trigger").click();
    await expect(page.getByTestId("locale-switcher-menu")).toBeVisible();
    await page.getByTestId("locale-option-zh-CN").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByTestId("home-local-empty")).toContainText(/当前这台电脑|MCP/);

    await page.getByTestId("locale-switcher-trigger").click();
    await expect(page.getByTestId("locale-switcher-menu")).toBeVisible();
    await page.getByTestId("locale-option-en").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("home-local-empty")).toContainText(
      /computer you are using|MCP/i,
    );
  });

  test("switches theme dark ↔ light", async ({ page }) => {
    await page.getByTestId("theme-switcher-trigger").click();
    await expect(page.getByTestId("theme-switcher-menu")).toBeVisible();
    await page.getByTestId("theme-option-light").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.getByTestId("theme-switcher-trigger").click();
    await expect(page.getByTestId("theme-switcher-menu")).toBeVisible();
    await page.getByTestId("theme-option-dark").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("sidebar hosts and k8s view toggles", async ({ page }) => {
    const api = await twE2e(page);
    await api.openK8sWorkbench();
    await api.openHome();
    await expect(page.getByTestId("home-local-chat")).toBeVisible();
    await page.getByRole("tab", { name: /Hosts|主机/i }).click();
    await expect(page.getByRole("tab", { name: /Hosts|主机/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("tab", { name: /Kubernetes/i }).click();
    await expect(page.getByRole("tab", { name: /Kubernetes/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("locale and theme stay across the three sidebars", async ({ page }) => {
    await page.getByTestId("locale-switcher-trigger").click();
    await page.getByTestId("locale-option-zh-CN").click();
    await page.getByTestId("theme-switcher-trigger").click();
    await page.getByTestId("theme-option-light").click();

    for (const id of ["sidebar-view-hosts", "sidebar-view-k8s", "sidebar-view-db"]) {
      await page.getByTestId(id).click();
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    }
    await expect(page.getByTestId("sidebar-view-hosts")).toHaveAttribute("aria-label", "主机");
    await expect(page.getByTestId("sidebar-view-db")).toHaveAttribute("aria-label", "数据库");
  });

  test("sidebar width survives reload", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("terminal-wisely.sidebar-width", "320");
    });
    await page.reload();
    await page.waitForFunction(() => window.__TW_E2E__ != null, undefined, {
      timeout: 30_000,
    });
    await expect(page.locator(".app-shell")).toHaveAttribute(
      "style",
      /--sidebar-width:\s*320px/,
    );
  });
});
