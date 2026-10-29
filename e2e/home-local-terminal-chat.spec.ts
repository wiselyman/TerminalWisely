import { expect, test } from "@playwright/test";
import { gotoApp, twE2e } from "./tw-e2e";

test("Home is a local terminal beside local chat", async ({ page }) => {
  await gotoApp(page);
  await (await twE2e(page)).openHome();

  const home = page.getByTestId("home-local-chat");
  const terminal = home.getByTestId("home-local-terminal");
  const chat = home.getByTestId("home-work-chat");
  await expect(terminal).toBeVisible();
  await expect(terminal.locator(".xterm-screen")).toBeVisible();
  await expect(chat).toBeHidden();
  await expect(home.getByTestId("home-split-resizer")).toBeHidden();
  const collapsedHomeBounds = await home.boundingBox();
  const collapsedTerminalBounds = await home.locator("#home-local-terminal-pane").boundingBox();
  expect(collapsedHomeBounds).not.toBeNull();
  expect(collapsedTerminalBounds).not.toBeNull();
  expect(Math.abs(collapsedHomeBounds!.width - collapsedTerminalBounds!.width)).toBeLessThan(2);
  await page.getByTestId("ai-engineer-tool").click();
  await expect(chat).toBeVisible();
  const terminalPadding = await terminal.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).paddingLeft),
  );
  expect(terminalPadding).toBeGreaterThanOrEqual(12);
  for (const [theme, expectedBackground] of [
    ["light", "rgb(255, 255, 255)"],
    ["dark", "rgb(13, 17, 23)"],
  ] as const) {
    if (await page.locator("html").getAttribute("data-theme") !== theme) {
      await page.getByTestId("theme-switcher-trigger").click();
      await page.getByTestId(`theme-option-${theme}`).click();
    }
    await expect.poll(() => terminal.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe(expectedBackground);
  }
  await expect(chat).toBeVisible();
  await expect(home.getByTestId("ai-engineer-composer")).toBeVisible();
  await page.getByRole("button", { name: /collapse panel|收起面板/i }).click();
  await expect(chat).toBeHidden();
  await expect(home.getByTestId("home-split-resizer")).toBeHidden();
  await page.getByTestId("ai-engineer-tool").click();
  await expect(chat).toBeVisible();
  await expect(home.getByTestId("home-work-tab-web")).toHaveCount(0);
  await expect(home.getByTestId("home-work-tab-command")).toHaveCount(0);
  await expect(home.getByTestId("home-work-tab-file")).toHaveCount(0);
  await expect(page.getByTestId("operation-project-sidebar")).toHaveCount(0);
  await expect(page.locator('[data-tab-role="home"]')).toHaveCount(0, { timeout: 1000 });
  const resizer = home.getByRole("separator", { name: /terminal.*chat|终端.*聊天/i });
  await expect(resizer).toBeVisible({ timeout: 1000 });
  const terminalBox = await terminal.boundingBox();
  const chatBox = await chat.boundingBox();
  expect(terminalBox).not.toBeNull();
  expect(chatBox).not.toBeNull();
  expect(terminalBox!.x).toBeLessThan(chatBox!.x);
  expect(Math.abs(terminalBox!.width - chatBox!.width)).toBeLessThan(12);

  const initialWidth = terminalBox!.width;
  const handleBox = await resizer.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 120, handleBox!.y + handleBox!.height / 2);
  await page.mouse.up();
  await expect.poll(async () => (await terminal.boundingBox())?.width ?? 0).toBeGreaterThan(initialWidth + 80);
  await resizer.focus();
  await page.keyboard.press("End");
  await expect(resizer).toHaveAttribute("aria-valuenow", "80");
  await page.keyboard.press("ArrowLeft");
  await expect(resizer).toHaveAttribute("aria-valuenow", "78");
  const savedRatio = await page.evaluate(() => localStorage.getItem("tw.home-terminal-ratio"));
  expect(Number(savedRatio)).toBeCloseTo(0.78, 2);

  await page.reload();
  await (await twE2e(page)).openHome();
  const restoredTerminal = await page.getByTestId("home-local-terminal").boundingBox();
  expect(restoredTerminal).not.toBeNull();
  expect(restoredTerminal!.width).toBeGreaterThan(initialWidth + 150);
  await expect(page.getByTestId("home-split-resizer")).toHaveAttribute("aria-valuenow", "78");
});

test("Home plus adds an independent local Terminal tab instead of starting SSH", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();

  await expect(page.getByTestId("home-terminal-tab")).toHaveCount(1);
  const sshCallsBefore = await api.getCreateSshCallCount();
  await page.getByTestId("chrome-new-session").click();

  await expect(page.getByTestId("home-terminal-tab")).toHaveCount(2);
  await expect(page.getByTestId("home-terminal-tab").nth(1)).toHaveClass(/active/);
  await expect(page.getByTestId("home-local-terminal")).toHaveCount(2);
  await expect(page.getByTestId("close-home-terminal-1")).toHaveCount(0);
  expect(await api.getCreateSshCallCount()).toBe(sshCallsBefore);

  await page.getByTestId("home-terminal-tab").first().click();
  await expect(page.getByTestId("home-terminal-tab").first()).toHaveClass(/active/);
  await page.getByTestId("close-home-terminal-2").click();
  await expect(page.getByTestId("home-terminal-tab")).toHaveCount(1);
  await page.getByTestId("chrome-new-session").click();
  await expect(page.getByTestId("home-terminal-tab")).toHaveCount(2);
  await page.getByTestId("close-home-terminal-3").click();
  await expect(page.getByTestId("home-terminal-tab")).toHaveCount(1);
  await expect(page.getByTestId("home-terminal-tab")).toHaveAttribute("data-terminal-id", "home-terminal-1");
});

test("Home local Desktop target isolation", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();

  const home = page.getByTestId("home-local-chat");
  await expect(page.getByTestId("local-fs-tool")).toBeVisible();
  await page.getByTestId("local-fs-tool").click();
  await expect(page.getByTestId("host-desktop-panel")).toBeVisible();
  await expect(page.getByTestId("desktop-icon-aiLinux")).toHaveCount(0);
  for (const app of ["files", "processes", "browser"]) {
    await expect(page.getByTestId(`dock-app-${app}`)).toHaveCount(0);
    await expect(page.getByTestId(`desktop-icon-${app}`)).toHaveCount(0);
  }
  for (const app of ["terminal", "ai-local", "markwisely"]) {
    await expect(page.getByTestId(`dock-app-${app}`)).toBeVisible();
  }
  await expect(page.getByTestId("home-local-terminal")).toBeVisible();

  await page.getByTestId("local-fs-tool").click();
  await expect(page.getByTestId("host-desktop-panel")).toHaveCount(0);
  await expect(home).toBeVisible();
  await expect(page.getByTestId("home-local-terminal")).toBeVisible();
});

test("Home titlebar Chat returns from Local Desktop to the existing chat", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();

  await page.getByTestId("ai-engineer-tool").click();
  const composer = page.getByTestId("home-local-chat").getByTestId("ai-engineer-composer").locator("textarea");
  await composer.fill("keep this Home chat draft");
  await page.getByTestId("local-fs-tool").click();
  await expect(page.getByTestId("host-desktop-panel")).toBeVisible();

  await page.getByTestId("ai-engineer-tool").click();

  await expect(page.getByTestId("host-desktop-panel")).toHaveCount(0);
  await expect(page.getByTestId("home-local-terminal")).toBeVisible();
  await expect(page.getByTestId("home-local-chat")).toBeVisible();
  await expect(composer).toHaveValue("keep this Home chat draft");
});

test("AI Local Dock glyph has a visible tile background", async ({ page }) => {
  await gotoApp(page);
  await (await twE2e(page)).openHome();
  await page.getByTestId("local-fs-tool").click();

  const glyph = page.getByTestId("dock-app-ai-local").locator(".host-desktop-glyph");
  await expect(glyph).toBeVisible();
  await expect.poll(() => glyph.evaluate((element) => getComputedStyle(element).backgroundImage))
    .not.toBe("none");
});

test("Home Desktop opens the existing local chat as AI Local", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  const sshCallsBefore = await api.getCreateSshCallCount();

  await page.getByTestId("ai-engineer-tool").click();
  const homeComposer = page.getByTestId("ai-engineer-composer").locator("textarea");
  await expect(homeComposer).toBeVisible();
  await homeComposer.fill("draft from Home chat");
  await page.getByTestId("local-fs-tool").click();
  await expect(page.getByTestId("desktop-icon-aiLocal")).toBeVisible();
  await expect(page.getByTestId("desktop-icon-aiLinux")).toHaveCount(0);
  await expect(page.getByTestId("host-ai-linux-float")).toHaveCount(0);
  await page.getByTestId("dock-app-ai-local").click();

  const aiLocal = page.getByTestId("home-ai-local-float");
  await expect(aiLocal).toBeVisible();
  await expect(aiLocal.getByTestId("ai-engineer-composer").locator("textarea")).toHaveValue("draft from Home chat");
  expect(await api.getCreateSshCallCount()).toBe(sshCallsBefore);
  await page.getByTestId("home-ai-local-close").click();
  await expect(aiLocal).toHaveCount(0);
  await page.getByTestId("local-fs-tool").click();
  await expect(page.getByTestId("home-local-chat").getByTestId("ai-engineer-composer").locator("textarea")).toHaveValue("draft from Home chat");
});

test("Home desktop terminal continuity", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  const terminal = page.getByTestId("home-local-terminal");
  await expect(terminal).toBeVisible();
  await terminal.evaluate((element) => {
    (window as Window & { __homeTerminalNode?: Element }).__homeTerminalNode = element;
  });

  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-terminal").click();
  const desktopTerminal = page.getByTestId("desktop-terminal-host");
  await expect(desktopTerminal).toBeVisible();
  expect(await desktopTerminal.evaluate((element) =>
    element.querySelector('[data-testid="home-local-terminal"]') ===
      (window as Window & { __homeTerminalNode?: Element }).__homeTerminalNode,
  )).toBe(true);
  await page.getByTestId("host-terminal-close").click();
  expect(await page.getByTestId("home-local-terminal").evaluate((element) =>
    element === (window as Window & { __homeTerminalNode?: Element }).__homeTerminalNode,
  )).toBe(true);

});

test("Home Desktop omits the native Files app", async ({ page }) => {
  await gotoApp(page);
  const api = await twE2e(page);
  await api.openHome();
  await page.getByTestId("local-fs-tool").click();
  await expect(page.getByTestId("dock-app-files")).toHaveCount(0);
});

test("Home MarkWisely creates, saves, and reopens local Markdown", async ({ page }) => {
  await gotoApp(page);
  await (await twE2e(page)).openHome();
  await page.getByTestId("local-fs-tool").click();
  await page.getByTestId("dock-app-markwisely").click();
  await page.getByTestId("markwisely-new-document").click();
  await page.getByTestId("markwisely-use-folder").click();
  await page.getByTestId("markwisely-file-name").fill("local-note.md");
  await page.getByTestId("markwisely-create-submit").click();
  await expect(page.getByTestId("markwisely-editor-view")).toBeVisible();
  const editor = page.locator(".vditor-ir");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type("# Local note");
  await expect(page.getByTestId("markwisely-save")).toHaveCount(0);
  await expect(page.getByTestId("markwisely-save-status")).toHaveText(/Saved|已保存/, { timeout: 10_000 });
  await page.locator(".markwisely-editor-view .markwisely-back").click();
  await expect(page.getByTestId("markwisely-recent").filter({ hasText: "local-note.md" })).toBeVisible();
  await page.getByTestId("markwisely-recent").filter({ hasText: "local-note.md" }).click();
  await expect(editor).toContainText("Local note");
});

test("Home Desktop omits the native Processes app", async ({ page }) => {
  await gotoApp(page);
  await (await twE2e(page)).openHome();
  await page.getByTestId("local-fs-tool").click();
  await expect(page.getByTestId("dock-app-processes")).toHaveCount(0);
});
