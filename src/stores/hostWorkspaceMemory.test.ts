import { beforeEach, describe, expect, it, vi } from "vitest";

const panel = {
  aiOpen: false,
  aiSession: null as string | null,
  deskOpen: false,
  deskSession: null as string | null,
  apps: {
    files: { open: false, minimized: false, maximized: false },
    processes: { open: false, minimized: false, maximized: false },
    browser: { open: false, minimized: false, maximized: false },
  },
  focusOrder: [] as Array<"files" | "processes" | "browser">,
  filesTab: "files" as "files" | "find",
};

const closeAi = vi.fn(() => {
  panel.aiOpen = false;
});
const bindManagedEntity = vi.fn(
  (
    ref: { sessionId: string },
    opts?: { open?: boolean },
  ) => {
    panel.aiOpen = Boolean(opts?.open);
    panel.aiSession = ref.sessionId;
  },
);
const closeDesktop = vi.fn(() => {
  panel.deskOpen = false;
  panel.deskSession = null;
});
const openDesktop = vi.fn((sessionId: string) => {
  panel.deskOpen = true;
  panel.deskSession = sessionId;
});
const applySessionUi = vi.fn(
  (ui: {
    apps: typeof panel.apps;
    focusOrder: typeof panel.focusOrder;
    filesTab: typeof panel.filesTab;
  }) => {
    panel.apps = ui.apps;
    panel.focusOrder = ui.focusOrder;
    panel.filesTab = ui.filesTab;
  },
);

vi.mock("./aiEngineerStore", () => ({
  useAiEngineerStore: {
    getState: () => ({
      get open() {
        return panel.aiOpen;
      },
      get sessionId() {
        return panel.aiSession;
      },
      get chatScope() {
        return panel.aiSession ? `linux:${panel.aiSession}` : null;
      },
      close: closeAi,
      bindManagedEntity,
    }),
    setState: (patch: { open?: boolean; sessionId?: string }) => {
      if (typeof patch.open === "boolean") panel.aiOpen = patch.open;
      if ("sessionId" in patch && patch.sessionId !== undefined) {
        panel.aiSession = patch.sessionId;
      }
    },
  },
}));

vi.mock("./desktopStore", () => ({
  useDesktopStore: {
    getState: () => ({
      get open() {
        return panel.deskOpen;
      },
      get sessionId() {
        return panel.deskSession;
      },
      get apps() {
        return panel.apps;
      },
      get focusOrder() {
        return panel.focusOrder;
      },
      get filesTab() {
        return panel.filesTab;
      },
      close: closeDesktop,
      openDesktop,
      applySessionUi,
    }),
    setState: (patch: Partial<typeof panel>) => {
      if ("open" in patch) panel.deskOpen = Boolean(patch.open);
      if ("sessionId" in patch)
        panel.deskSession = (patch as { sessionId: string | null }).sessionId;
      if ("apps" in patch) panel.apps = (patch as { apps: typeof panel.apps }).apps;
      if ("focusOrder" in patch)
        panel.focusOrder = (patch as { focusOrder: typeof panel.focusOrder })
          .focusOrder;
      if ("filesTab" in patch)
        panel.filesTab = (patch as { filesTab: typeof panel.filesTab }).filesTab;
    },
  },
}));

vi.mock("./localFsStore", () => ({
  useLocalFsStore: { getState: () => ({ close: vi.fn() }) },
}));
vi.mock("./taskManagerStore", () => ({
  useTaskManagerStore: { getState: () => ({ close: vi.fn() }) },
}));
vi.mock("./findStore", () => ({
  useFindStore: { getState: () => ({ close: vi.fn() }) },
}));
vi.mock("./workspacePanelSwitch", () => ({
  skipNextWorkspacePanelEnter: vi.fn(),
}));

import { skipNextWorkspacePanelEnter } from "./workspacePanelSwitch";

vi.mock("./browserStore", () => ({
  useBrowserStore: {
    getState: () => ({
      open: false,
      webviewLabel: null,
      close: vi.fn(),
      park: vi.fn(),
      discardSessionBucket: vi.fn(),
    }),
  },
}));

vi.mock("../lib/isTauri", () => ({
  isTauriRuntime: () => false,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("hostWorkspaceMemory", () => {
  beforeEach(() => {
    vi.resetModules();
    panel.aiOpen = false;
    panel.aiSession = null;
    panel.deskOpen = false;
    panel.deskSession = null;
    panel.apps = {
      files: { open: false, minimized: false, maximized: false },
      processes: { open: false, minimized: false, maximized: false },
      browser: { open: false, minimized: false, maximized: false },
    };
    panel.focusOrder = [];
    panel.filesTab = "files";
    closeAi.mockClear();
    bindManagedEntity.mockClear();
    closeDesktop.mockClear();
    openDesktop.mockClear();
    applySessionUi.mockClear();
  });

  it("restores AI vs desktop per host", async () => {
    const {
      captureHostWorkspace,
      restoreHostWorkspace,
      peekHostWorkspace,
    } = await import("./hostWorkspaceMemory");

    panel.aiOpen = true;
    panel.aiSession = "host-a";
    captureHostWorkspace("host-a");
    expect(peekHostWorkspace("host-a")?.panel).toBe("aiEngineer");

    panel.aiOpen = false;
    panel.aiSession = null;
    panel.deskOpen = true;
    panel.deskSession = "host-b";
    panel.apps.browser = { open: true, minimized: false, maximized: false };
    panel.focusOrder = ["browser"];
    captureHostWorkspace("host-b");
    expect(peekHostWorkspace("host-b")?.panel).toBe("desktop");
    expect(peekHostWorkspace("host-b")?.desktop?.apps.browser.open).toBe(true);

    restoreHostWorkspace("host-a", { serverId: "srv-a", label: "A" });
    expect(panel.deskOpen).toBe(false);
    expect(bindManagedEntity).toHaveBeenCalled();
    expect(panel.aiOpen).toBe(true);
    expect(panel.aiSession).toBe("host-a");

    restoreHostWorkspace("host-b");
    expect(closeAi).not.toHaveBeenCalled();
    expect(panel.aiOpen).toBe(false);
    expect(openDesktop).toHaveBeenCalledWith("host-b");
    expect(applySessionUi).toHaveBeenCalled();
  });

  it("warm-reopens AI without rebinding when returning to same host", async () => {
    const { captureHostWorkspace, restoreHostWorkspace } = await import(
      "./hostWorkspaceMemory"
    );

    panel.aiOpen = true;
    panel.aiSession = "host-a";
    captureHostWorkspace("host-a");

    // Host switch while AI still open — soft-hide, keep session/chatScope.
    restoreHostWorkspace("host-b");
    expect(panel.aiOpen).toBe(false);
    expect(panel.aiSession).toBe("host-a");

    bindManagedEntity.mockClear();
    closeAi.mockClear();
    vi.mocked(skipNextWorkspacePanelEnter).mockClear();
    restoreHostWorkspace("host-a", { serverId: "srv-a", label: "A" });
    expect(bindManagedEntity).not.toHaveBeenCalled();
    expect(panel.aiOpen).toBe(true);
    expect(panel.aiSession).toBe("host-a");
    // Park restore must stay silent — no slide-in enter animation.
    expect(skipNextWorkspacePanelEnter).toHaveBeenCalled();
  });

  it("keeps first host AI after connect-tab soft-hide then return", async () => {
    const {
      captureHostWorkspace,
      restoreHostWorkspace,
      markHostAiShell,
      peekHostWorkspace,
    } = await import("./hostWorkspaceMemory");

    // Host A has AI open; connecting B captures A then soft-hides.
    panel.aiOpen = true;
    panel.aiSession = "host-a";
    captureHostWorkspace("host-a");
    expect(peekHostWorkspace("host-a")?.panel).toBe("aiEngineer");

    restoreHostWorkspace("pending-b");
    expect(panel.aiOpen).toBe(false);
    expect(peekHostWorkspace("host-a")?.panel).toBe("aiEngineer");

    // B auto-opens AI (simulates afterSuccessfulConnect).
    panel.aiOpen = true;
    panel.aiSession = "host-b";
    markHostAiShell("host-b");

    // Click back to A — must restore AI, not terminal-only.
    captureHostWorkspace("host-b");
    bindManagedEntity.mockClear();
    restoreHostWorkspace("host-a", { serverId: "srv-a", label: "A" });
    expect(peekHostWorkspace("host-a")?.panel).toBe("aiEngineer");
    expect(panel.aiOpen).toBe(true);
    expect(panel.aiSession).toBe("host-a");
  });

  it("does not wipe soft-hidden AI shell to none on recapture", async () => {
    const {
      captureHostWorkspace,
      restoreHostWorkspace,
      peekHostWorkspace,
      listAiFiberSessions,
    } = await import("./hostWorkspaceMemory");

    panel.aiOpen = true;
    panel.aiSession = "host-a";
    captureHostWorkspace("host-a");
    restoreHostWorkspace("host-b");
    expect(panel.aiOpen).toBe(false);
    expect(listAiFiberSessions()).toContain("host-a");

    // Recapture while soft-hidden must keep aiEngineer.
    captureHostWorkspace("host-a");
    expect(peekHostWorkspace("host-a")?.panel).toBe("aiEngineer");
  });
});
