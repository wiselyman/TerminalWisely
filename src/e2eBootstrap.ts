import { isE2eBrowserMode } from "./lib/e2eRuntime";
import { E2E_SSH_SESSION_ID } from "./e2e/fixtures";
import {
  __e2eCreateSshCallCount,
  __e2eEmitTerminalOutput,
  __e2eLastAiLease,
  __e2eLastAiTerminalExec,
  __e2eLastCreateSshRequest,
  __e2eLastEnterDirectory,
  __e2eLastKillProcess,
  __e2eLastTerminalCommand,
  __e2eSeedRemotePath,
  __e2eLastPreviewOpen,
  __e2eLastPreviewSave,
  __e2eLastLocalBytesWrite,
  __e2eLastRemoteBytesWrite,
  __e2eSetNextDialogSaveResult,
  __e2eSetNextDialogOpenResult,
  __e2eSetPandocFormats,
  __e2eLastPandocImport,
  __e2eFailNextLocalWrite,
  __e2eFailNextLocalRead,
  __e2eLocalText,
  __e2eSeedLocalText,
  __e2eSetLocalReadDelay,
  __e2eLastUploadRequest,
  __e2eResetMocks,
  __e2eEnableNestedEditorTreeFixture,
  __e2eResetUploadRequest,
} from "./e2e/tauriCoreMock";
import { invoke } from "@tauri-apps/api/core";
import { useAiEngineerStore } from "./stores/aiEngineerStore";
import { useLocalFsStore } from "./stores/localFsStore";
import { useSidebarViewStore } from "./stores/sidebarViewStore";
import { focusManagedEntity, useManagedEntityStore } from "./stores/managedEntityStore";
import { useSessionStore } from "./stores/sessionStore";
import { useHostStatsStore } from "./stores/hostStatsStore";
import { useMarkWiselyStore } from "./stores/markWiselyStore";
import { useEditorWiselyStore } from "./stores/editorWiselyStore";
import { openLocalFileInDesktop } from "./lib/localFileOpen";
import { useDesktopStore } from "./stores/desktopStore";
import { useToastStore } from "./stores/toastStore";
import { useAppUpdateStore } from "./stores/appUpdateStore";
import { switchWorkspacePanel } from "./stores/workspacePanelSwitch";
import { openAppSettings } from "./stores/downloadSettingsStore";
import {
  captureHostWorkspace,
  restoreHostWorkspace,
} from "./stores/hostWorkspaceMemory";
import type { HostStatsSnapshot, TabSession } from "./types";

export interface TwE2eApi {
  openHome: () => void;
  openHomeDirectory: () => void;
  openSshTab: () => void;
  openSecondSshTab: () => void;
  closeTab: (sessionId: string) => Promise<void>;
  setActiveTab: (sessionId: string) => void;
  setHostMachineName: (hostname: string) => void;
  openLocalFsPanel: () => void;
  openLocalDesktopFiles: () => void;
  seedRemotePath: (path: string) => void;
  enableNestedEditorTreeFixture: () => void;
  getLastTerminalCommand: () => Record<string, unknown> | null;
  openBrowserPanel: () => void;
  openAiChat: () => Promise<void>;
  openAiChatForSsh: () => Promise<void>;
  /** Mark the live AI run as busy (no sidecar stream) for host-switch tests. */
  simulateAiBusy: () => void;
  finishSimulatedAiRun: () => void;
  /**
   * Grow a streaming assistant bubble (seed tall history first). Used to verify
   * stick-to-bottom pins before paint during token growth.
   */
  simulateStreamingAssistantGrow: (opts?: {
    seedRows?: number;
    chunk?: string;
    reset?: boolean;
  }) => void;
  getAiBusy: () => boolean;
  /** Distance from bottom of the active (unparked) AI messages scroller. */
  getAiChatScrollDist: () => number;
  emitTerminalPrompt: (text?: string) => void;
  simulateTerminalDrop: (paths: string[]) => Promise<void>;
  simulateApproval: (command?: string) => void;
  approvePending: () => void;
  rejectPending: () => void;
  invokeEnterDirectory: (path: string) => Promise<string>;
  invokePreviewOpen: (path: string) => Promise<unknown>;
  openMarkdownPreview: (path?: string) => Promise<void>;
  simulateLocalFileOpen: (path: string) => Promise<void>;
  openEditorWiselyDocument: (path: string, target?: { kind: "local" } | { kind: "ssh"; sessionId: string }) => Promise<void>;
  resetMocks: () => void;
  getLastUpload: () => Record<string, unknown> | null;
  getLastCreateSsh: () => Record<string, unknown> | null;
  getCreateSshCallCount: () => number;
  getLastEnterDirectory: () => Record<string, unknown> | null;
  getLastPreviewOpen: () => Record<string, unknown> | null;
  getLastPreviewSave: () => Record<string, unknown> | null;
  getLastLocalBytesWrite: () => Record<string, unknown> | null;
  getLastRemoteBytesWrite: () => Record<string, unknown> | null;
  setNextDialogSaveResult: (path: string | null) => void;
  setNextDialogOpenResult: (path: string | null) => void;
  setPandocFormats: (input: string[], output: string[]) => void;
  getLastPandocImport: () => Record<string, unknown> | null;
  getMarkWiselyDocument: (path: string) => { text: string } | null;
  failNextLocalWrite: () => void;
  failNextLocalRead: () => void;
  getLocalText: (path: string) => string | null;
  seedLocalText: (path: string, text: string) => void;
  setLocalReadDelay: (milliseconds: number) => void;
  getLastAiTerminalExec: () => Record<string, unknown> | null;
  getLastAiLease: () => Record<string, unknown> | null;
  getLastKillProcess: () => Record<string, unknown> | null;
  resetUpload: () => void;
  openSettings: () => void;
  showUpdateDialog: (body: string) => void;
  invokeKillProcess: (pid: number) => Promise<void>;
  /** Drop model profiles so the picker shows the unconfigured label. */
  clearAiModelConfig: () => Promise<void>;
}

declare global {
  interface Window {
    __TW_E2E__?: TwE2eApi;
  }
}

const E2E_SSH_SESSION_ID_2 = "e2e-ssh-session-2";

function openHome() {
  useSessionStore.getState().activateHome();
  useManagedEntityStore.getState().showHomeWorkspace();
  useAiEngineerStore.getState().close({ force: true });
  useLocalFsStore.getState().close();
}

function openHomeDirectory() {
  useSessionStore.getState().activateHome();
  useManagedEntityStore.getState().showHomeDirectory();
  useAiEngineerStore.getState().close({ force: true });
  useLocalFsStore.getState().close();
}

function mountSshTab(tab: TabSession) {
  useSidebarViewStore.getState().setView("hosts");
  const existing = useSessionStore.getState().tabs.filter((t) => t.id !== tab.id);
  useSessionStore.setState({
    tabs: [...existing, tab],
    activeTabId: tab.id,
  });
  focusManagedEntity({
    kind: "server",
    id: tab.server_id || tab.id,
    label: tab.title,
    sessionId: tab.id,
    serverId: tab.server_id,
  });
}

function openSshTab() {
  mountSshTab({
    id: E2E_SSH_SESSION_ID,
    title: "e2e@127.0.0.1",
    kind: "ssh",
    active: true,
    connectionStatus: "ready",
    server_id: "e2e@127.0.0.1:22",
    remote_home: "/home/e2e",
    os_id: "linux",
    os_name: "Linux",
  });
  window.setTimeout(() => {
    __e2eEmitTerminalOutput("Welcome e2e SSH session\r\ne2e@127.0.0.1:~$ ", E2E_SSH_SESSION_ID);
  }, 150);
}

function openSecondSshTab() {
  const prev = useSessionStore.getState().activeTabId;
  if (prev) captureHostWorkspace(prev);
  mountSshTab({
    id: E2E_SSH_SESSION_ID_2,
    title: "e2e2@127.0.0.1",
    kind: "ssh",
    active: true,
    connectionStatus: "ready",
    server_id: "e2e2@127.0.0.1:22",
    remote_home: "/home/e2e",
    os_id: "linux",
    os_name: "Linux",
  });
  // Match real tab switches: soft-hide prior host AI without aborting the run.
  restoreHostWorkspace(E2E_SSH_SESSION_ID_2);
}

async function closeTab(sessionId: string) {
  await useSessionStore.getState().closeTab(sessionId);
}

function setActiveTab(sessionId: string) {
  useSessionStore.getState().setActiveTab(sessionId);
}

function setHostMachineName(hostname: string) {
  const sessionId = useSessionStore.getState().activeTabId;
  if (!sessionId) throw new Error("An SSH session must be active to set its machine name");
  useHostStatsStore.setState({
    snapshot: {
      hostname,
      os_name: "Linux",
      arch: "x86_64",
      cpu_usage_percent: 0,
      cpu_core_count: 1,
      memory_total_bytes: 1,
      memory_used_bytes: 0,
      swap_total_bytes: 0,
      swap_used_bytes: 0,
      load_avg: [0, 0, 0],
      uptime_secs: 0,
      process_count: 0,
      logged_in_users: [],
      disks: [],
      networks: [],
      sampled_at: Date.now(),
    } satisfies HostStatsSnapshot,
    activeSessionId: sessionId,
  });
}

function openLocalFsPanel() {
  switchWorkspacePanel("localFs", E2E_SSH_SESSION_ID, "e2e@127.0.0.1:22", "files");
}

function openLocalDesktopFiles() {
  useDesktopStore.getState().openDesktopTarget({ kind: "local" });
  useDesktopStore.getState().launchApp("files");
}

function openBrowserPanel() {
  switchWorkspacePanel("browser", E2E_SSH_SESSION_ID);
}

function showUpdateDialog(body: string) {
  const update = { version: "0.0.9", body };
  const pending = {
    update: update as never,
    currentVersion: "0.0.8",
    needsPrivilege: false,
  };
  useAppUpdateStore.setState({ pending, dialog: pending });
}

async function openAiChat() {
  openHome();
  useManagedEntityStore.getState().setHomeChatOpen(true);
  useAiEngineerStore.getState().bindLocalContext();
  await useAiEngineerStore.getState().ensureReady();
}

async function openAiChatForSsh() {
  useAiEngineerStore.getState().bindManagedEntity(
    {
      kind: "server",
      id: "e2e@127.0.0.1:22",
      label: "e2e@127.0.0.1",
      sessionId: E2E_SSH_SESSION_ID,
      serverId: "e2e@127.0.0.1:22",
    },
    { open: true },
  );
  await useAiEngineerStore.getState().ensureReady();
}

async function clearAiModelConfig() {
  await useAiEngineerStore.getState().saveSettings({
    profiles: [],
    active_profile_id: "",
    agent_runtime: "builtin",
  });
}

function finishSimulatedAiRun() {
  useAiEngineerStore.setState({
    busy: false,
    modelPhase: "idle",
    messages: useAiEngineerStore.getState().messages.map((message) =>
      message.kind === "assistant" ? { ...message, streaming: false } : message,
    ),
  });
}

function simulateAiBusy() {
  // Busy without a visible streaming bubble so the footer busy-phase line shows
  // (shouldShowChatBusyLine hides when streaming assistant text is visible).
  useAiEngineerStore.setState({
    busy: true,
    modelPhase: "thinking",
  });
}

function simulateStreamingAssistantGrow(opts?: {
  seedRows?: number;
  chunk?: string;
  reset?: boolean;
}) {
  const seedRows = opts?.seedRows ?? 20;
  const chunk = opts?.chunk ?? "\nmore output line";
  const reset = opts?.reset ?? false;
  const state = useAiEngineerStore.getState();
  const STREAM_ID = "e2e-stream-assistant";
  let messages = state.messages;
  if (reset || !messages.some((m) => m.id === STREAM_ID)) {
    const seeds = Array.from({ length: seedRows }, (_, i) => ({
      id: `e2e-seed-${i}`,
      kind: "assistant" as const,
      content: `seed row ${i}\n${"x".repeat(120)}`,
      streaming: false,
    }));
    messages = [
      ...seeds,
      {
        id: STREAM_ID,
        kind: "assistant" as const,
        content: "stream start",
        streaming: true,
      },
    ];
  } else {
    messages = messages.map((m) =>
      m.id === STREAM_ID && m.kind === "assistant"
        ? { ...m, content: `${m.content}${chunk}`, streaming: true }
        : m,
    );
  }
  useAiEngineerStore.setState({
    busy: true,
    modelPhase: "streaming",
    messages,
  });
}

function getAiBusy() {
  return useAiEngineerStore.getState().busy;
}

function getAiChatScrollDist() {
  const el = document.querySelector(
    ".ai-engineer-panel:not(.ai-engineer-panel-parked) .ai-engineer-messages",
  ) as HTMLElement | null;
  if (!el) return Number.POSITIVE_INFINITY;
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

function terminalDropTarget(): HTMLElement {
  const el = document.querySelector<HTMLElement>(
    '[data-testid="terminal-view"].active .terminal-view-inner',
  );
  if (!el) {
    throw new Error("active terminal-view-inner not found");
  }
  return el;
}

function buildDragDataTransfer(paths: string[]): DataTransfer {
  const dataTransfer = new DataTransfer();
  for (const p of paths) {
    const name = p.split(/[/\\]/).pop() ?? "upload.txt";
    const file = new File(["e2e-upload"], name, { type: "text/plain" });
    Object.assign(file, { path: p });
    dataTransfer.items.add(file);
  }
  dataTransfer.setData("text/plain", paths.join("\n"));
  Object.defineProperty(dataTransfer, "types", {
    get: () => ["Files"],
  });
  return dataTransfer;
}

async function simulateTerminalDrop(paths: string[]) {
  const el = terminalDropTarget();
  const dataTransfer = buildDragDataTransfer(paths);
  const dragEnter = new DragEvent("dragenter", {
    bubbles: true,
    cancelable: true,
    dataTransfer,
  });
  Object.defineProperty(dragEnter, "dataTransfer", { value: dataTransfer });
  el.dispatchEvent(dragEnter);
  const drop = new DragEvent("drop", {
    bubbles: true,
    cancelable: true,
    dataTransfer,
  });
  Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });
  el.dispatchEvent(drop);
}

function simulateApproval(command = "echo approval-e2e") {
  const approvalId = `e2e-approval-${Date.now()}`;
  const callId = `e2e-call-${Date.now()}`;
  useAiEngineerStore.setState({
    pendingApproval: {
      approvalId,
      dualConfirm: false,
      confirmPhrase: command,
      rememberableBinaries: [],
      resolve: () => {},
    },
    messages: [
      ...useAiEngineerStore.getState().messages,
      {
        id: approvalId,
        kind: "approval" as const,
        approvalId,
        callId,
        command,
        risk: "R2",
        reason: "e2e approval",
        intent: "Run test command",
        impactPreview: "No impact",
        rememberableBinaries: [],
        networkGuard: false,
        dualConfirm: false,
        confirmPhrase: command,
        execCommand: command,
      },
    ],
  });
}

function approvePending() {
  useAiEngineerStore.getState().resolveApproval(true);
}

function rejectPending() {
  useAiEngineerStore.getState().resolveApproval(false);
}

async function invokeEnterDirectory(path: string) {
  return invoke<string>("enter_directory", {
    request: { session_id: E2E_SSH_SESSION_ID, remote_path: path },
  });
}

async function invokePreviewOpen(path: string) {
  return invoke("preview_open", {
    request: { session_id: E2E_SSH_SESSION_ID, path },
  });
}

async function openMarkdownPreview(path = "/tmp/e2e-note.md") {
  const { usePreviewStore } = await import("./stores/previewStore");
  await usePreviewStore.getState().openPreview(E2E_SSH_SESSION_ID, path);
  usePreviewStore.getState().restorePreview();
}

async function simulateLocalFileOpen(path: string) {
  await openLocalFileInDesktop(path, {
    activateLocalDesktop: () => {
      useSessionStore.getState().activateHome();
      useManagedEntityStore.getState().showHomeWorkspace();
      useSidebarViewStore.getState().setView("hosts");
      useDesktopStore.getState().openDesktopTarget({ kind: "local" });
    },
    showMarkWisely: () => {
      useDesktopStore.getState().launchApp("markwisely");
      useDesktopStore.getState().setAppMaximized("markwisely", true);
    },
    openMarkdown: async (filePath) => {
      try {
        await useMarkWiselyStore.getState().openDocument({ target: { kind: "local" }, hostKey: "local", path: filePath });
      } catch (error) {
        useToastStore.getState().pushToast(error instanceof Error ? error.message : String(error), false);
      }
    },
    showEditorWisely: () => {
      useDesktopStore.getState().launchApp("editorwisely");
    },
    openText: async (filePath) => {
      await useEditorWiselyStore.getState().open({ kind: "local" }, filePath);
    },
  });
}

function openSettings() {
  openAppSettings();
}

async function invokeKillProcess(pid: number) {
  await invoke("kill_process", {
    request: { session_id: E2E_SSH_SESSION_ID, pid, signal: "TERM" },
  });
}

/** Playwright / CI browser E2E helpers */
export function runE2eBootstrap(): void {
  if (!isE2eBrowserMode()) return;

  const api: TwE2eApi = {
    openHome,
    openHomeDirectory,
    openSshTab,
    openSecondSshTab,
    closeTab,
    setActiveTab,
    setHostMachineName,
    openLocalFsPanel,
    openLocalDesktopFiles,
    seedRemotePath: __e2eSeedRemotePath,
    enableNestedEditorTreeFixture: __e2eEnableNestedEditorTreeFixture,
    getLastTerminalCommand: __e2eLastTerminalCommand,
    openBrowserPanel,
    openAiChat,
    openAiChatForSsh,
    clearAiModelConfig,
    simulateAiBusy,
    finishSimulatedAiRun,
    simulateStreamingAssistantGrow,
    getAiBusy,
    getAiChatScrollDist,
    emitTerminalPrompt: (text = "e2e@127.0.0.1:~$ ") => {
      __e2eEmitTerminalOutput(`${text}\r\n`);
    },
    simulateTerminalDrop,
    simulateApproval,
    approvePending,
    rejectPending,
    invokeEnterDirectory,
    invokePreviewOpen,
    openMarkdownPreview,
    simulateLocalFileOpen,
    resetMocks: __e2eResetMocks,
    getLastUpload: __e2eLastUploadRequest,
    getLastCreateSsh: __e2eLastCreateSshRequest,
    getCreateSshCallCount: __e2eCreateSshCallCount,
    getLastEnterDirectory: __e2eLastEnterDirectory,
    getLastPreviewOpen: __e2eLastPreviewOpen,
    getLastPreviewSave: __e2eLastPreviewSave,
    getLastLocalBytesWrite: __e2eLastLocalBytesWrite,
    getLastRemoteBytesWrite: __e2eLastRemoteBytesWrite,
    setNextDialogSaveResult: __e2eSetNextDialogSaveResult,
    setNextDialogOpenResult: __e2eSetNextDialogOpenResult,
    setPandocFormats: __e2eSetPandocFormats,
    getLastPandocImport: __e2eLastPandocImport,
    getMarkWiselyDocument: (path) => useMarkWiselyStore.getState().getDocuments("local").find((document) => document.path === path) ?? null,
    openEditorWiselyDocument: async (path, target) => { const activeTarget = target ?? useDesktopStore.getState().target ?? { kind: "local" as const }; useDesktopStore.getState().launchApp("editorwisely"); await useEditorWiselyStore.getState().open(activeTarget, path); },
    failNextLocalWrite: __e2eFailNextLocalWrite,
    failNextLocalRead: __e2eFailNextLocalRead,
    getLocalText: __e2eLocalText,
    seedLocalText: __e2eSeedLocalText,
    setLocalReadDelay: __e2eSetLocalReadDelay,
    getLastAiTerminalExec: __e2eLastAiTerminalExec,
    getLastAiLease: __e2eLastAiLease,
    getLastKillProcess: __e2eLastKillProcess,
    resetUpload: __e2eResetUploadRequest,
    openSettings,
    showUpdateDialog,
    invokeKillProcess,
  };

  window.__TW_E2E__ = api;

  // Only auto-boot when VITE_E2E_SCENARIO is set. Default homeOpen is already
  // true; a delayed openHome() races with Playwright helpers (openSshTab /
  // host bootstraps) and snaps the UI back to the welcome page.
  const scenario = import.meta.env.VITE_E2E_SCENARIO?.trim();
  if (!scenario) return;

  const boot = () => {
    switch (scenario) {
      case "ssh":
        openSshTab();
        break;
      case "localfs":
        openSshTab();
        openLocalFsPanel();
        break;
      case "ai":
      case "chat":
        void openAiChat();
        break;
      case "home":
        openHome();
        break;
      default:
        break;
    }
  };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", () => setTimeout(boot, 50));
  } else {
    setTimeout(boot, 50);
  }
}
