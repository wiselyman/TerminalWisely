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
    await expect(page.locator(".host-stats-statusbar")).toHaveCount(0);
    await expect(page.locator(".app-shell")).not.toHaveClass(/has-host-stats-statusbar/);
    await expect(page.getByTestId("sidebar-view-home")).toHaveAttribute("aria-selected", "true");
    for (const space of ["hosts", "k8s", "db"]) {
      await expect(page.getByTestId(`sidebar-view-${space}`)).toHaveAttribute("aria-selected", "false");
    }
    await expect(page.getByRole("button", { name: /收起侧栏|collapse sidebar/i })).toHaveCount(0);
    const terminalBounds = await page.locator(".home-local-terminal-pane").boundingBox();
    expect(terminalBounds?.x).toBe(0);
    await page.getByTestId("sidebar-view-hosts").click();
    await expect(page.locator('[data-tab-role="home"]')).toHaveCount(0);
    await expect(page.locator(".sidebar-shell")).toBeVisible();
    await expect(page.locator(".host-stats-statusbar")).toBeVisible();
    await expect(page.locator(".app-shell")).toHaveClass(/has-host-stats-statusbar/);
    await expect(page.getByRole("button", { name: /收起侧栏|collapse sidebar/i })).toBeVisible();
    await expect(page.getByTestId("home-local-chat")).toHaveCount(0);
    await expandUngroupedEntities(page);
    await expect(page.getByRole("button", { name: "E2E Test Host" })).toBeVisible();
    await page.getByTestId("sidebar-view-home").click();
    await expect(page.locator(".sidebar-shell")).toBeHidden();
    await expect(page.getByRole("button", { name: /收起侧栏|collapse sidebar/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "E2E Test Host" })).toHaveCount(0);
  });

  test("isolates Home, Hosts, Kubernetes, and database tabs while switching spaces", async ({ page }) => {
    const api = await twE2e(page);
    await api.openSshTab();
    await expect(page.locator('[data-tab-kind="ssh"]')).toHaveCount(1);

    await page.getByTestId("sidebar-view-home").click();
    await expect(page.getByTestId("home-terminal-tab")).toHaveCount(1);
    await expect(page.locator('[data-tab-kind="ssh"]')).toHaveCount(0);
    await expect(page.locator('[data-tab-role="k8s-cluster"]')).toHaveCount(0);
    await expect(page.getByTestId("db-workspace-tab")).toHaveCount(0);

    await page.getByTestId("sidebar-view-hosts").click();
    await expect(page.locator('[data-tab-kind="ssh"]')).toHaveCount(1);
    await expect(page.getByTestId("home-terminal-tab")).toHaveCount(0);
    await api.openK8sWorkbench();
    await expect(page.locator('[data-tab-role="k8s-cluster"]')).toHaveCount(1);
    await expect(page.locator('[data-tab-kind="ssh"]')).toHaveCount(0);

    await page.getByTestId("sidebar-view-home").click();
    await expect(page.getByTestId("home-terminal-tab")).toHaveCount(1);
    await expect(page.locator('[data-tab-role="k8s-cluster"]')).toHaveCount(0);
    await page.getByTestId("sidebar-view-db").click();
    await api.openDbWorkspace();
    await expect(page.getByTestId("db-workspace-tab")).toHaveCount(1);
    await expect(page.getByTestId("home-terminal-tab")).toHaveCount(0);
    await expect(page.locator('[data-tab-kind="ssh"]')).toHaveCount(0);
    await expect(page.locator('[data-tab-role="k8s-cluster"]')).toHaveCount(0);

    await page.getByTestId("sidebar-view-home").click();
    await expect(page.getByTestId("home-terminal-tab")).toHaveCount(1);
    await expect(page.getByTestId("db-workspace-tab")).toHaveCount(0);
    await page.getByTestId("sidebar-view-db").click();
    await expect(page.getByTestId("db-workspace-tab")).toHaveCount(1);
  });

  test("Kubernetes empty workbench omits the redundant selection hint", async ({ page }) => {
    const api = await twE2e(page);
    await api.clearK8sSelection();
    await page.getByTestId("sidebar-view-k8s").click();
    await expect(page.getByTestId("k8s-workbench-empty")).toBeVisible();
    await expect(page.getByText(/Select a cluster from the sidebar, or click \+ to add one\.|请从侧栏选择集群，或点 \+ 添加。/)).toHaveCount(0);
    await expect(page.getByTestId("chrome-new-session")).toBeVisible();
    await page.getByTestId("chrome-new-session").click();
    await expect(page.getByTestId("k8s-add-cluster")).toBeVisible();
  });

  test("keeps the Home chat collapsed until opened from the titlebar", async ({ page }) => {
    const home = page.getByTestId("home-local-chat");
    await expect(home).toBeVisible();
    await expect(page.getByTestId("home-work-chat")).toBeHidden();
    await expect(page.locator("#home-local-terminal-pane")).toHaveJSProperty("clientWidth", await home.evaluate((el) => el.clientWidth));
    await page.getByTestId("ai-engineer-tool").click();
    await expect(home.getByTestId("home-local-empty")).toBeVisible();
    await expect(home.getByTestId("ai-engineer-composer")).toBeVisible();
    await expect(page.getByTestId("workspace-welcome")).toHaveCount(0);
  });

  test("Home chat toggle does not change the Hosts AI chat", async ({ page }) => {
    const api = await twE2e(page);
    await page.getByTestId("sidebar-view-hosts").click();
    await api.openSshTab();
    await page.getByTestId("ai-engineer-tool").click();
    const hostsChat = page.locator('.ai-engineer-panel:not(.is-home-workspace)');
    await expect(hostsChat).toBeVisible();

    await page.getByTestId("sidebar-view-home").click();
    await expect(page.getByTestId("home-work-chat")).toBeHidden();
    await page.getByTestId("ai-engineer-tool").click();
    await expect(page.getByTestId("home-work-chat")).toBeVisible();
    await page.getByTestId("sidebar-view-hosts").click();
    await expect(hostsChat).toBeVisible();
  });

  test("switches locale en ↔ zh-CN", async ({ page }) => {
    await page.getByTestId("ai-engineer-tool").click();
    await page.getByTestId("locale-switcher-trigger").click();
    await expect(page.getByTestId("locale-switcher-menu")).toBeVisible();
    await expect(page.getByTestId("locale-switcher-trigger")).toContainText("EN");
    await expect(page.locator("[data-locale-flag]")).toHaveCount(0);
    await expect(page.getByTestId("locale-option-zh-CN")).toContainText("中文");
    await page.getByTestId("locale-option-zh-CN").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByTestId("home-local-empty")).toContainText("本机聊天");
    await expect(page.getByTestId("home-local-empty")).toContainText("Terminal");
    await expect(page.getByTestId("home-local-empty")).not.toContainText("MCP");

    await page.getByTestId("locale-switcher-trigger").click();
    await expect(page.getByTestId("locale-switcher-menu")).toBeVisible();
    await expect(page.getByTestId("locale-switcher-trigger")).toContainText("中");
    await expect(page.locator("[data-locale-flag]")).toHaveCount(0);
    await page.getByTestId("locale-option-en").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("home-local-empty")).toContainText(
      /Home chat.*Terminal/i,
    );
    await expect(page.getByTestId("home-local-empty")).not.toContainText("MCP");
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
    await expect(page.locator('[data-tab-role="home"]')).toHaveCount(0);
    await page.getByRole("tab", { name: /Kubernetes/i }).click();
    await expect(page.getByRole("tab", { name: /Kubernetes/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator('[data-tab-role="home"]')).toHaveCount(0);
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
