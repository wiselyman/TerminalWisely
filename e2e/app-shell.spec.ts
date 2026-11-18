import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test.describe("App shell & welcome", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openHome();
  });

  test("Home tab returns to the host directory without scope controls", async ({ page }) => {
    const api = await twE2e(page);
    await api.resetMocks();
    await page.getByTestId("home-directory-tab").click();
    await expect(page.locator(".sidebar-shell")).toBeHidden();
    await expect(page.locator(".host-stats-statusbar")).toHaveCount(0);
    await expect(page.locator(".app-shell")).not.toHaveClass(/has-host-stats-statusbar/);
    await expect(page.getByTestId("home-directory-tab")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("sidebar-view-hosts")).toHaveCount(0);
    await expect(page.getByTestId("sidebar-view-home")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /收起侧栏|collapse sidebar/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Hosts" })).toHaveCount(0);
    await expect(page.getByTestId("home-directory-terminal")).toHaveCount(0);
    await api.openSshTab();
    await expect(page.locator('[data-tab-role="home"]')).toHaveCount(0);
    await expect(page.locator(".sidebar-shell")).toBeHidden();
    await expect(page.locator(".host-stats-statusbar")).toBeVisible();
    await expect(page.locator(".app-shell")).toHaveClass(/has-host-stats-statusbar/);
    await expect(page.getByRole("button", { name: /收起侧栏|collapse sidebar/i })).toHaveCount(0);
    await expect(page.getByTestId("home-local-chat")).toHaveCount(0);
    await page.getByTestId("home-directory-tab").click();
    await expect(page.locator(".sidebar-shell")).toBeHidden();
    await expect(page.getByRole("button", { name: /收起侧栏|collapse sidebar/i })).toHaveCount(0);
    await expect(page.getByTestId("home-host-directory")).toBeVisible();
    await expect(page.getByTestId("home-host-card-e2e-conn-1")).toBeVisible();
  });

  test("isolates Home and SSH tabs while switching workspaces", async ({ page }) => {
    const api = await twE2e(page);
    await api.openSshTab();
    await expect(page.locator('[data-tab-kind="ssh"]')).toHaveCount(1);

    await page.getByTestId("home-directory-tab").click();
    await page.getByTestId("home-local-host-card").click();
    await expect(page.getByTestId("local-desktop-tab")).toBeVisible();
    await expect(page.getByTestId("home-terminal-tab")).toHaveCount(0);
    await expect(page.locator('[data-tab-kind="ssh"]')).toHaveCount(1);

    await page.locator('[data-tab-kind="ssh"]').click();
    await expect(page.locator('[data-tab-kind="ssh"]')).toHaveCount(1);
    await expect(page.getByTestId("home-terminal-tab")).toHaveCount(0);
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

  test("switches locale en ↔ zh-CN", async ({ page }) => {
    const localeTrigger = page.getByTestId("locale-switcher-trigger");
    const themeTrigger = page.getByTestId("theme-switcher-trigger");
    await localeTrigger.click();
    await page.getByTestId("locale-option-en").click();
    await expect(localeTrigger).toContainText("EN");
    const englishLocaleWidth = (await localeTrigger.boundingBox())?.width;
    const englishThemeX = (await themeTrigger.boundingBox())?.x;

    await page.getByTestId("ai-engineer-tool").click();
    await localeTrigger.click();
    await expect(page.getByTestId("locale-switcher-menu")).toBeVisible();
    await expect(page.getByTestId("locale-switcher-trigger")).toContainText("EN");
    await expect(page.locator("[data-locale-flag]")).toHaveCount(0);
    await expect(page.getByTestId("locale-option-zh-CN")).toContainText("中文");
    await page.getByTestId("locale-option-zh-CN").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    const chineseLocaleWidth = (await localeTrigger.boundingBox())?.width;
    const chineseThemeX = (await themeTrigger.boundingBox())?.x;
    expect(chineseLocaleWidth).toBe(englishLocaleWidth);
    expect(chineseThemeX).toBe(englishThemeX);
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

  test("Home tab navigates between the directory and host workspaces", async ({ page }) => {
    const api = await twE2e(page);
    await api.openHome();
    await expect(page.getByTestId("home-local-chat")).toBeVisible();
    await api.openSshTab();
    await expect(page.locator('[data-tab-role="home"]')).toHaveCount(0);
    await page.getByTestId("home-directory-tab").click();
    await expect(page.getByTestId("home-host-directory")).toBeVisible();
  });

  test("locale and theme stay across Home and Hosts", async ({ page }) => {
    await page.getByTestId("locale-switcher-trigger").click();
    await page.getByTestId("locale-option-zh-CN").click();
    await page.getByTestId("theme-switcher-trigger").click();
    await page.getByTestId("theme-option-light").click();

    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const api = await twE2e(page);
    await api.openSshTab();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("workspace stays single-column after reload", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("terminal-wisely.sidebar-width", "320");
    });
    await page.reload();
    await page.waitForFunction(() => window.__TW_E2E__ != null, undefined, {
      timeout: 30_000,
    });
    await expect(page.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
    await expect(page.locator(".sidebar-shell")).toBeHidden();
  });
});
