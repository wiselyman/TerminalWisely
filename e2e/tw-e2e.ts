import { expect, type Page } from "@playwright/test";
import type { TwE2eApi } from "../src/e2eBootstrap";

async function waitForTwE2e(page: Page) {
  await page.waitForFunction(() => window.__TW_E2E__ != null, undefined, {
    timeout: 30_000,
  });
}

function wrapApi(page: Page): TwE2eApi {
  const call = <K extends keyof TwE2eApi>(method: K, ...args: unknown[]) =>
    page.evaluate(
      ([name, payload]) => {
        const api = window.__TW_E2E__!;
        const fn = api[name as keyof TwE2eApi] as (...a: unknown[]) => unknown;
        return fn(...(payload as unknown[]));
      },
      [method, args] as const,
    );

  return {
    openHome: () => call("openHome"),
    openK8sWorkbench: async () => {
      await call("openK8sWorkbench");
      await page.locator(".k8s-workbench").waitFor({ state: "visible", timeout: 30_000 });
    },
    openSshTab: async () => {
      await call("openSshTab");
      await page.getByTestId("terminal-view").waitFor({ state: "visible", timeout: 15_000 });
    },
    openSecondSshTab: () => call("openSecondSshTab"),
    closeTab: (sessionId) => call("closeTab", sessionId) as Promise<void>,
    setActiveTab: (sessionId) => call("setActiveTab", sessionId),
    openLocalFsPanel: async () => {
      await call("openLocalFsPanel");
    },
    openAiChat: () => call("openAiChat") as Promise<void>,
    openAiChatForSsh: () => call("openAiChatForSsh") as Promise<void>,
    emitTerminalPrompt: (text) => call("emitTerminalPrompt", text),
    simulateTerminalDrop: (paths) => call("simulateTerminalDrop", paths) as Promise<void>,
    simulateApproval: (command) => call("simulateApproval", command),
    approvePending: () => call("approvePending"),
    rejectPending: () => call("rejectPending"),
    invokeEnterDirectory: (path) => call("invokeEnterDirectory", path) as Promise<string>,
    invokePreviewOpen: (path) => call("invokePreviewOpen", path),
    resetMocks: () => call("resetMocks"),
    getLastUpload: () => call("getLastUpload") as Promise<Record<string, unknown> | null>,
    getLastCreateSsh: () => call("getLastCreateSsh") as Promise<Record<string, unknown> | null>,
    getCreateSshCallCount: () => call("getCreateSshCallCount") as Promise<number>,
    getLastEnterDirectory: () =>
      call("getLastEnterDirectory") as Promise<Record<string, unknown> | null>,
    getLastPreviewOpen: () => call("getLastPreviewOpen") as Promise<Record<string, unknown> | null>,
    getLastAiTerminalExec: () =>
      call("getLastAiTerminalExec") as Promise<Record<string, unknown> | null>,
    getLastAiLease: () => call("getLastAiLease") as Promise<Record<string, unknown> | null>,
    getLastK8sApply: () => call("getLastK8sApply") as Promise<Record<string, unknown> | null>,
    getLastKillProcess: () => call("getLastKillProcess") as Promise<Record<string, unknown> | null>,
    getLastK8sRolloutRestart: () =>
      call("getLastK8sRolloutRestart") as Promise<Record<string, unknown> | null>,
    getLastK8sHelmInstall: () =>
      call("getLastK8sHelmInstall") as Promise<Record<string, unknown> | null>,
    getLastK8sOpenKubectlTerminal: () =>
      call("getLastK8sOpenKubectlTerminal") as Promise<Record<string, unknown> | null>,
    getLastK8sDelete: () =>
      call("getLastK8sDelete") as Promise<Record<string, unknown> | null>,
    setK8sCategory: (category) => call("setK8sCategory", category) as Promise<void>,
    resetUpload: () => call("resetUpload"),
    openSettings: () => call("openSettings"),
    invokeKillProcess: (pid) => call("invokeKillProcess", pid) as Promise<void>,
    invokeK8sApplyYaml: (yaml) => call("invokeK8sApplyYaml", yaml) as Promise<void>,
  };
}

/** Browser-side E2E helpers — methods run in page context (functions are not serializable). */
export async function twE2e(page: Page): Promise<TwE2eApi> {
  await waitForTwE2e(page);
  return wrapApi(page);
}

export async function gotoApp(page: Page) {
  await page.goto("/");
  await waitForTwE2e(page);
}

/** Expand default Ungrouped entity list (collapsed by default). */
export async function expandUngroupedEntities(page: Page) {
  const group = page.getByTestId("entity-group-__ungrouped__");
  await expect(group).toBeVisible({ timeout: 15_000 });
  const collapse = group.locator(".entity-group-collapse");
  if ((await collapse.getAttribute("aria-expanded")) !== "true") {
    await collapse.click();
  }
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
}
