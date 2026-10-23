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
  await expect(chat).toBeVisible();
  await expect(home.getByTestId("ai-engineer-composer")).toBeVisible();
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
  expect(await api.getCreateSshCallCount()).toBe(sshCallsBefore);

  await page.getByTestId("home-terminal-tab").first().click();
  await expect(page.getByTestId("home-terminal-tab").first()).toHaveClass(/active/);
  await page.getByTestId("close-home-terminal-2").click();
  await expect(page.getByTestId("home-terminal-tab")).toHaveCount(1);
  await page.getByTestId("close-home-terminal-1").click();
  await expect(page.getByTestId("home-terminal-tab")).toHaveCount(1);
  await expect(page.getByTestId("home-terminal-tab")).toHaveAttribute("data-terminal-id", "home-terminal-3");
});
