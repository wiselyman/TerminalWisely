import type { Page } from "@playwright/test";
import type { TwE2eApi } from "../src/e2eBootstrap";

async function waitForTwE2e(page: Page) {
  await page.waitForFunction(() => window.__TW_E2E__ != null, undefined, {
    timeout: 30_000,
  });
}

/** Browser-side E2E helpers — methods run in page context (functions are not serializable). */
export async function twE2e(page: Page): Promise<TwE2eApi> {
  await waitForTwE2e(page);
  return {
    openHome: () => page.evaluate(() => window.__TW_E2E__!.openHome()),
    openK8sWorkbench: () =>
      page.evaluate(async () => {
        await window.__TW_E2E__!.openK8sWorkbench();
      }),
    openSshTab: () => page.evaluate(() => window.__TW_E2E__!.openSshTab()),
    openLocalFsPanel: () => page.evaluate(() => window.__TW_E2E__!.openLocalFsPanel()),
    openAiPlatform: () =>
      page.evaluate(async () => {
        await window.__TW_E2E__!.openAiPlatform();
      }),
    openAiChat: () =>
      page.evaluate(async () => {
        await window.__TW_E2E__!.openAiChat();
      }),
    emitTerminalPrompt: (text?: string) =>
      page.evaluate((prompt) => window.__TW_E2E__!.emitTerminalPrompt(prompt), text),
  };
}

export async function gotoApp(page: Page) {
  await page.goto("/");
  await waitForTwE2e(page);
}
