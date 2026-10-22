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
  const terminalBox = await terminal.boundingBox();
  const chatBox = await chat.boundingBox();
  expect(terminalBox).not.toBeNull();
  expect(chatBox).not.toBeNull();
  expect(terminalBox!.x).toBeLessThan(chatBox!.x);
  expect(Math.abs(terminalBox!.width - chatBox!.width)).toBeLessThan(2);
});
