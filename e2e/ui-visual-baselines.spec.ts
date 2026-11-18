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

  test("Home host directory remains usable at narrow widths", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 720 });
    await gotoApp(page);
    await (await twE2e(page)).openHomeDirectory();
    const directory = page.getByTestId("home-host-directory");
    await expect(page.getByTestId("home-local-host-card")).toBeVisible();
    await expect(page.getByTestId("home-terminal-tab")).toHaveCount(0);
    const bounds = await directory.boundingBox();
    expect(bounds).not.toBeNull();
    expect(Math.round(bounds!.y + bounds!.height)).toBe(720);
    await expect.poll(() => directory.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const darkCanvas = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--tw-canvas").trim());
    expect(darkCanvas).toBe("#0c1118");

    await setTheme(page, "light");
    const lightCanvas = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--tw-canvas").trim());
    expect(lightCanvas).toBe("#f3f5f8");
  });

  test("MarkWisely writing surface remains legible in both app themes", async ({ page }) => {
    test.skip(process.platform !== "darwin", "Pixel baselines are maintained on the native macOS runner; cross-platform UI contracts still run everywhere.");
    await gotoApp(page);
    const api = await twE2e(page);
    await api.seedLocalText("/tmp/visual-markdown.md", "# A calm writing surface\n\nA short paragraph with readable line length and comfortable spacing.");
    await api.openHome();
    await page.getByTestId("local-fs-tool").click();
    await page.getByTestId("dock-app-markwisely").click();
    await page.getByTestId("markwisely-open-document").click();
    await page.getByRole("dialog", { name: "Choose folder" }).getByRole("button", { name: "Use this folder" }).click();
    await page.getByTestId("markwisely-file-entry").filter({ hasText: "visual-markdown.md" }).click();
    const editorView = page.getByTestId("markwisely-editor-view");
    await expect(editorView).toBeVisible();
    for (const theme of themes) {
      await setTheme(page, theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.waitForTimeout(250);
      await expect(editorView).toHaveScreenshot(`markwisely-editor-${theme}.png`, {
        animations: "disabled",
        caret: "hide",
        maxDiffPixels: 20,
      });
    }
  });

  test("Home host directory remains legible in both themes", async ({ page }) => {
    test.skip(process.platform !== "darwin", "Pixel baselines are maintained on the native macOS runner; cross-platform UI contracts still run everywhere.");
    await gotoApp(page);
    await (await twE2e(page)).openHomeDirectory();
    await expect(page.getByTestId("home-host-directory")).toBeVisible();
    await expect(page.getByTestId("home-local-host-card")).toBeVisible();
    await expect(page.getByTestId("home-terminal-tab")).toHaveCount(0);
    for (const theme of themes) {
      await setTheme(page, theme);
      await expect(page).toHaveScreenshot(`home-${theme}.png`, {
        fullPage: false,
        animations: "disabled",
        caret: "hide",
        maxDiffPixels: 20,
      });
    }
  });

  test("SSH Desktop remains legible without a Hosts sidebar", async ({ page }) => {
    test.skip(process.platform !== "darwin", "Pixel baselines are maintained on the native macOS runner; cross-platform UI contracts still run everywhere.");
    await gotoApp(page);
    await (await twE2e(page)).openSshTab();
    await page.getByTestId("local-fs-tool").click();
    await expect(page.getByTestId("host-desktop-panel")).toBeVisible();
    await expect(page.locator(".sidebar-shell")).toBeHidden();
    await expect(page.locator(".terminal-view-connecting")).toHaveCount(0, { timeout: 10_000 });
    await page.addStyleTag({
      content: '[data-testid="host-desktop-panel"] .host-desktop-menubar time { visibility: hidden !important; }',
    });
    for (const theme of themes) {
      await setTheme(page, theme);
      await expect(page).toHaveScreenshot(`hosts-${theme}.png`, {
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

  test("File preview in both themes", async ({ page }) => {
    test.skip(process.platform !== "darwin", "Pixel baselines are maintained on the native macOS runner; cross-platform UI contracts still run everywhere.");
    await gotoApp(page);
    const api = await twE2e(page);
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
        maxDiffPixels: 100,
      });
      await preview.getByRole("button", { name: "Close" }).click();
      await expect(preview).toBeHidden();
    }
  });

  test("Local files and desktop workspace in both themes", async ({ page }) => {
    test.skip(process.platform !== "darwin", "Pixel baselines are maintained on the native macOS runner; cross-platform UI contracts still run everywhere.");
    await gotoApp(page);
    const api = await twE2e(page);
    await api.openSshTab();
    await api.setHostMachineName("e2e-machine");
    await api.openLocalFsPanel();
    await expect(page.getByTestId("host-desktop-panel")).toBeVisible();
    await expect(page.getByTestId("host-file-manager-panel")).toBeVisible();
    const desktopClock = page.locator(".host-desktop-clock");
    await desktopClock.evaluate((clock) => {
      clock.style.width = "140px";
      clock.style.minWidth = "140px";
      clock.style.flex = "0 0 140px";
      clock.style.height = "30px";
    });
    await page.addStyleTag({ content: ".host-desktop-clock { visibility: hidden !important; }" });
    for (const theme of themes) {
      await setTheme(page, theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.waitForTimeout(250);
      await expect(page).toHaveScreenshot(`local-files-${theme}.png`, {
        fullPage: false,
        animations: "disabled",
        caret: "hide",
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
