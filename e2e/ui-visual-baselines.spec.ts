import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

const themes = ["dark", "light"] as const;

async function setTheme(page: import("@playwright/test").Page, theme: (typeof themes)[number]) {
  if (await page.locator("html").getAttribute("data-theme") === theme) return;
  await page.getByTestId("theme-switcher-trigger").click();
  await page.getByTestId(`theme-option-${theme}`).click();
}

test.describe("UI visual baselines", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("shared theme tokens and keyboard focus remain legible at narrow widths", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 720 });
    await gotoApp(page);
    await (await twE2e(page)).openHome();
    const home = page.getByTestId("home-local-chat");
    const splitter = page.getByTestId("home-split-resizer");
    await expect(page.getByTestId("home-work-chat")).toBeHidden();
    await page.getByTestId("ai-engineer-tool").click();
    await expect(page.getByTestId("home-work-chat")).toBeVisible();
    const bounds = await home.boundingBox();
    expect(bounds).not.toBeNull();
    expect(Math.round(bounds!.y + bounds!.height)).toBe(720);
    await splitter.evaluate((el) => (el as HTMLElement).focus({ focusVisible: true }));
    await expect.poll(() => home.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const themeValues = await page.evaluate(() => ({
      canvas: getComputedStyle(document.documentElement).getPropertyValue("--tw-canvas").trim(),
      focus: getComputedStyle(document.querySelector(".home-local-splitter")!, "::after").backgroundColor,
    }));
    expect(themeValues).toEqual({ canvas: "#0c1118", focus: "rgb(78, 140, 247)" });

    await setTheme(page, "light");
    await splitter.evaluate((el) => (el as HTMLElement).focus({ focusVisible: true }));
    const lightValues = await page.evaluate(() => ({
      canvas: getComputedStyle(document.documentElement).getPropertyValue("--tw-canvas").trim(),
      focus: getComputedStyle(document.querySelector(".home-local-splitter")!, "::after").backgroundColor,
    }));
    expect(lightValues).toEqual({ canvas: "#f3f5f8", focus: "rgb(40, 103, 215)" });
  });

  test("Home terminal and local chat remain balanced in both themes", async ({ page }) => {
    test.skip(process.platform !== "darwin", "Pixel baselines are maintained on the native macOS runner; cross-platform UI contracts still run everywhere.");
    await gotoApp(page);
    await (await twE2e(page)).openHome();
    await expect(page.getByTestId("home-local-chat")).toBeVisible();
    await expect(page.getByTestId("home-work-chat")).toBeHidden();
    await page.getByTestId("ai-engineer-tool").click();
    await expect(page.getByTestId("home-work-chat")).toBeVisible();
    for (const theme of themes) {
      await setTheme(page, theme);
      await expect(page).toHaveScreenshot(`home-${theme}.png`, {
        fullPage: false,
        animations: "disabled",
        caret: "hide",
      });
    }
  });

  test("Hosts navigation and Kubernetes workspace in both themes", async ({ page }) => {
    test.skip(process.platform !== "darwin", "Pixel baselines are maintained on the native macOS runner; cross-platform UI contracts still run everywhere.");
    await gotoApp(page);
    const api = await twE2e(page);
    await page.getByTestId("sidebar-view-hosts").click();
    await expect(page.locator(".sidebar-shell")).toBeVisible();
    await expect(page.locator(".terminal-view-connecting")).toHaveCount(0, { timeout: 10_000 });
    for (const theme of themes) {
      await setTheme(page, theme);
      await expect(page).toHaveScreenshot(`hosts-${theme}.png`, {
        fullPage: false,
        animations: "disabled",
        caret: "hide",
      });
    }
    await api.openK8sWorkbench();
    await expect(page.locator(".k8s-workbench")).toBeVisible();
    for (const theme of themes) {
      await setTheme(page, theme);
      await expect(page).toHaveScreenshot(`kubernetes-${theme}.png`, {
        fullPage: false,
        animations: "disabled",
        caret: "hide",
      });
    }
  });

  test("AI chat and approval state in both themes", async ({ page }) => {
    test.skip(process.platform !== "darwin", "Pixel baselines are maintained on the native macOS runner; cross-platform UI contracts still run everywhere.");
    await gotoApp(page);
    const api = await twE2e(page);
    await api.resetMocks();
    await api.openSshTab();
    await api.openAiChatForSsh();
    const panel = page.getByTestId("ai-engineer-panel");
    await expect(page.getByTestId("ai-engineer-composer")).toBeVisible();
    for (const theme of themes) {
      await setTheme(page, theme);
      await expect(panel).toHaveScreenshot(`ai-chat-${theme}.png`, {
        animations: "disabled",
        caret: "hide",
      });
    }
    await api.simulateApproval("echo approval-baseline");
    await expect(page.getByTestId("ai-engineer-approval-card")).toBeVisible();
    for (const theme of themes) {
      await setTheme(page, theme);
      await expect(panel).toHaveScreenshot(`ai-approval-${theme}.png`, {
        animations: "disabled",
        caret: "hide",
      });
    }
  });

  test("Database form in both themes", async ({ page }) => {
    test.skip(process.platform !== "darwin", "Pixel baselines are maintained on the native macOS runner; cross-platform UI contracts still run everywhere.");
    await gotoApp(page);
    await page.getByTestId("sidebar-view-db").click();
    await page.getByTestId("chrome-new-session").click();
    await expect(page.getByTestId("db-connection-form")).toBeVisible();
    for (const theme of themes) {
      await setTheme(page, theme);
      await expect(page).toHaveScreenshot(`database-${theme}.png`, {
        fullPage: false,
        animations: "disabled",
        caret: "hide",
      });
    }
  });

  test("File preview in both themes", async ({ page }) => {
    test.skip(process.platform !== "darwin", "Pixel baselines are maintained on the native macOS runner; cross-platform UI contracts still run everywhere.");
    await gotoApp(page);
    const api = await twE2e(page);
    await page.getByTestId("sidebar-view-hosts").click();
    await api.openSshTab();
    for (const theme of themes) {
      await setTheme(page, theme);
      await api.openMarkdownPreview();
      const preview = page.getByRole("dialog", { name: "File preview" });
      await expect(preview).toBeVisible();
      await expect(preview).toHaveScreenshot(`file-preview-${theme}.png`, {
        fullPage: false,
        animations: "disabled",
        caret: "hide",
      });
      await preview.getByRole("button", { name: "Close" }).click();
      await expect(preview).toBeHidden();
    }
  });

  test("Local files and desktop workspace in both themes", async ({ page }) => {
    test.skip(process.platform !== "darwin", "Pixel baselines are maintained on the native macOS runner; cross-platform UI contracts still run everywhere.");
    await gotoApp(page);
    const api = await twE2e(page);
    await page.getByTestId("sidebar-view-hosts").click();
    await api.openSshTab();
    await api.setHostMachineName("e2e-machine");
    await api.openLocalFsPanel();
    await expect(page.getByTestId("host-desktop-panel")).toBeVisible();
    await expect(page.getByTestId("host-file-manager-panel")).toBeVisible();
    const desktopClock = page.locator(".host-desktop-clock");
    await desktopClock.evaluate((clock) => {
      clock.style.width = "140px";
      clock.style.minWidth = "140px";
    });
    for (const theme of themes) {
      await setTheme(page, theme);
      await expect(page).toHaveScreenshot(`local-files-${theme}.png`, {
        fullPage: false,
        animations: "disabled",
        caret: "hide",
        mask: [page.locator(".host-desktop-clock")],
      });
    }
  });

  test("Settings dialog in both themes", async ({ page }) => {
    test.skip(process.platform !== "darwin", "Pixel baselines are maintained on the native macOS runner; cross-platform UI contracts still run everywhere.");
    await gotoApp(page);
    const api = await twE2e(page);
    for (const theme of themes) {
      await setTheme(page, theme);
      await api.openSettings();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveScreenshot(`settings-${theme}.png`, {
        fullPage: false,
        animations: "disabled",
        caret: "hide",
      });
      await page.keyboard.press("Escape");
    }
  });
});
