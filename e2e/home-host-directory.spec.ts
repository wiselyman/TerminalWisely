import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

const expectQuick = expect.configure({ timeout: 5_000 });

test.describe("Home host directory", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page, "directory");
    const api = await twE2e(page);
    await api.resetMocks();
  });

  test("uses an icon Home launcher and shows only saved host cards", async ({ page }) => {
    await expectQuick(page.getByTestId("home-host-directory")).toBeVisible();
    await expectQuick(page.getByTestId("home-directory-button")).toBeVisible();
    await expectQuick(page.getByTestId("home-directory-tab")).toHaveCount(0);
    await expectQuick(page.getByTestId("local-desktop-tab")).toBeVisible();
    await expectQuick(page.getByTestId("chrome-sidebar-views")).toBeHidden();
    await expectQuick(page.getByTestId("sidebar-view-hosts")).toHaveCount(0);
    await expectQuick(page.getByTestId("sidebar-view-home")).toHaveCount(0);
    await expectQuick(page.locator(".tab-bar > .tab").first()).toHaveAttribute("data-testid", "local-desktop-tab");
    await expectQuick(page.getByRole("heading", { name: "Hosts" })).toHaveCount(0);
    await expectQuick(page.getByText("Choose a computer to open its desktop workspace.")).toHaveCount(0);
    await expectQuick(page.getByTestId("home-local-host-card")).toHaveCount(0);
    await expectQuick(page.getByTestId("home-local-section")).toHaveCount(0);
    await expectQuick(page.getByTestId("home-directory-terminal")).toHaveCount(0);
    await expectQuick(page.getByTestId("home-directory-chat")).toHaveCount(0);
    await expectQuick(page.getByRole("button", { name: /collapse sidebar|收起侧栏/i })).toHaveCount(0);
    await expectQuick(page.getByTestId("ai-engineer-tool")).toHaveCount(0);
    await expectQuick(page.getByTestId("local-fs-tool")).toHaveCount(0);
  });

  test("Local Desktop is pinned first and opens without creating an SSH session", async ({ page }) => {
    const api = await twE2e(page);
    const before = await api.getCreateSshCallCount();
    await expectQuick(page.getByTestId("local-desktop-tab")).toBeVisible();
    await expectQuick(page.getByTestId("local-desktop-tab").locator(".tab-close")).toHaveCount(0);
    await page.getByTestId("local-desktop-tab").click();
    await expectQuick(page.getByTestId("host-desktop-panel")).toBeVisible();
    await expectQuick(page.getByTestId("home-terminal-tab")).toHaveCount(0);
    await page.getByTestId("home-directory-button").click();
    await expectQuick(page.getByTestId("home-host-directory")).toBeVisible();
    expect(await api.getCreateSshCallCount()).toBe(before);
  });

  test("plus opens the SSH host form instead of creating a Terminal tab", async ({ page }) => {
    const api = await twE2e(page);
    await api.resetMocks();
    await expectQuick(page.getByTestId("home-terminal-tab")).toHaveCount(0);
    await page.getByTestId("chrome-new-session").click();
    await expectQuick(page.locator(".connection-form")).toBeVisible();
    await expectQuick(page.getByTestId("home-terminal-tab")).toHaveCount(0);
  });

  test("SSH Desktop has no left Hosts list or sidebar collapse control", async ({ page }) => {
    const api = await twE2e(page);
    await api.openSshTab();
    await page.getByTestId("local-fs-tool").click();
    await expectQuick(page.getByTestId("host-desktop-panel")).toBeVisible();
    await expectQuick(page.locator(".sidebar-shell")).toBeHidden();
    await expectQuick(page.getByTestId("sidebar-view-hosts")).toHaveCount(0);
    await expectQuick(page.locator(".chrome-sidebar-toggle")).toHaveCount(0);
    await expectQuick(page.getByTestId("home-terminal-tab")).toHaveCount(0);
  });

  test("opens a saved SSH host in its Desktop workspace", async ({ page }) => {
    const api = await twE2e(page);
    await expectQuick(page.getByTestId("home-host-card-e2e-conn-1")).toBeVisible();
    const before = await api.getCreateSshCallCount();
    await page.getByTestId("home-host-card-e2e-conn-1").click();
    await expectQuick(page.getByTestId("host-desktop-panel")).toBeVisible();
    await expectQuick(page.getByTestId("home-host-directory")).toHaveCount(0);
    await expectQuick(page.locator('[data-tab-kind="ssh"]').filter({ hasText: "E2E Test Host" })).toBeVisible();
    expect(await api.getCreateSshCallCount()).toBe(before + 1);
  });

  test("switches between Home, pinned Local Desktop, and SSH Desktop", async ({ page }) => {
    await page.getByTestId("local-desktop-tab").click();
    await expectQuick(page.getByRole("heading", { name: "This computer" })).toBeVisible();
    await page.getByTestId("home-directory-button").click();
    await expectQuick(page.getByTestId("home-host-directory")).toBeVisible();
    await page.getByTestId("home-host-card-e2e-conn-1").click();
    await expectQuick(page.getByTestId("host-desktop-panel")).toBeVisible();
    const workspaceTabs = await page.locator(".tab-bar > .tab").evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-testid") ?? item.getAttribute("data-tab-kind")),
    );
    expect(workspaceTabs[0]).toBe("local-desktop-tab");
    expect(workspaceTabs.indexOf("local-desktop-tab")).toBeLessThan(workspaceTabs.indexOf("ssh"));
    await page.getByTestId("local-desktop-tab").click();
    await expectQuick(page.getByRole("heading", { name: "This computer" })).toBeVisible();
    await page.getByTestId("home-directory-button").click();
    await expectQuick(page.getByTestId("home-host-directory")).toBeVisible();
  });
});
