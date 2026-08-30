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
  __e2eLastK8sApply,
  __e2eLastPreviewOpen,
  __e2eLastUploadRequest,
  __e2eResetMocks,
  __e2eResetUploadRequest,
} from "./e2e/tauriCoreMock";
import { invoke } from "@tauri-apps/api/core";
import { useAiEngineerStore } from "./stores/aiEngineerStore";
import { useK8sStore } from "./stores/k8sStore";
import { useLocalFsStore } from "./stores/localFsStore";
import { useSidebarViewStore } from "./stores/sidebarViewStore";
import { focusManagedEntity } from "./stores/managedEntityStore";
import { useSessionStore } from "./stores/sessionStore";
import { switchWorkspacePanel } from "./stores/workspacePanelSwitch";
import { openAppSettings } from "./stores/downloadSettingsStore";
import type { TabSession } from "./types";

export interface TwE2eApi {
  openHome: () => void;
  openK8sWorkbench: () => Promise<void>;
  openSshTab: () => void;
  openSecondSshTab: () => void;
  closeTab: (sessionId: string) => Promise<void>;
  setActiveTab: (sessionId: string) => void;
  openLocalFsPanel: () => void;
  openAiPlatform: () => Promise<void>;
  openAiChat: () => Promise<void>;
  openAiChatForSsh: () => Promise<void>;
  emitTerminalPrompt: (text?: string) => void;
  simulateTerminalDrop: (paths: string[]) => Promise<void>;
  simulateApproval: (command?: string) => void;
  approvePending: () => void;
  rejectPending: () => void;
  invokeEnterDirectory: (path: string) => Promise<string>;
  invokePreviewOpen: (path: string) => Promise<unknown>;
  resetMocks: () => void;
  getLastUpload: () => Record<string, unknown> | null;
  getLastCreateSsh: () => Record<string, unknown> | null;
  getCreateSshCallCount: () => number;
  getLastEnterDirectory: () => Record<string, unknown> | null;
  getLastPreviewOpen: () => Record<string, unknown> | null;
  getLastAiTerminalExec: () => Record<string, unknown> | null;
  getLastAiLease: () => Record<string, unknown> | null;
  getLastK8sApply: () => Record<string, unknown> | null;
  getLastKillProcess: () => Record<string, unknown> | null;
  resetUpload: () => void;
  openSettings: () => void;
  invokeKillProcess: (pid: number) => Promise<void>;
  invokeK8sApplyYaml: (yaml: string) => Promise<void>;
}

declare global {
  interface Window {
    __TW_E2E__?: TwE2eApi;
  }
}

const E2E_SSH_SESSION_ID_2 = "e2e-ssh-session-2";

function openHome() {
  useSessionStore.getState().activateHome();
  useAiEngineerStore.getState().close({ force: true });
  useLocalFsStore.getState().close();
}

async function openK8sWorkbench() {
  useSidebarViewStore.getState().setView("k8s");
  await useK8sStore.getState().refreshClusters();
  const cluster = useK8sStore.getState().selectedCluster;
  if (cluster) {
    useK8sStore.getState().selectCluster(cluster.id);
    useK8sStore.getState().setNamespace("demo");
    useK8sStore.getState().setCategory("pods");
    await useK8sStore.getState().refreshResources();
  }
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
}

async function closeTab(sessionId: string) {
  await useSessionStore.getState().closeTab(sessionId);
}

function setActiveTab(sessionId: string) {
  useSessionStore.getState().setActiveTab(sessionId);
}

function openLocalFsPanel() {
  switchWorkspacePanel("localFs", E2E_SSH_SESSION_ID, "e2e@127.0.0.1:22", "files");
}

async function openAiPlatform() {
  useAiEngineerStore.getState().bindManagedEntity(
    { kind: "cluster", id: "e2e-k3s-local", label: "e2e-k3s" },
    { open: true },
  );
  await useAiEngineerStore.getState().ensureReady();
  useAiEngineerStore.getState().openPlatformView();
}

async function openAiChat() {
  useAiEngineerStore.getState().bindManagedEntity(
    { kind: "cluster", id: "e2e-k3s-local", label: "e2e-k3s" },
    { open: true },
  );
  await useAiEngineerStore.getState().ensureReady();
  useAiEngineerStore.getState().setPlatformOpen(false);
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
  useAiEngineerStore.getState().setPlatformOpen(false);
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

function openSettings() {
  openAppSettings();
}

async function invokeKillProcess(pid: number) {
  await invoke("kill_process", {
    request: { session_id: E2E_SSH_SESSION_ID, pid, signal: "TERM" },
  });
}

async function invokeK8sApplyYaml(yaml: string) {
  await invoke("k8s_apply_yaml", {
    target: {
      id: "kube:e2e-context",
      kind: "kubeconfig",
      display_name: "e2e-k3s-local",
      context: "e2e-context",
      namespace: "demo",
    },
    yaml,
  });
}

/** Playwright / CI browser E2E helpers */
export function runE2eBootstrap(): void {
  if (!isE2eBrowserMode()) return;

  const api: TwE2eApi = {
    openHome,
    openK8sWorkbench,
    openSshTab,
    openSecondSshTab,
    closeTab,
    setActiveTab,
    openLocalFsPanel,
    openAiPlatform,
    openAiChat,
    openAiChatForSsh,
    emitTerminalPrompt: (text = "e2e@127.0.0.1:~$ ") => {
      __e2eEmitTerminalOutput(`${text}\r\n`);
    },
    simulateTerminalDrop,
    simulateApproval,
    approvePending,
    rejectPending,
    invokeEnterDirectory,
    invokePreviewOpen,
    resetMocks: __e2eResetMocks,
    getLastUpload: __e2eLastUploadRequest,
    getLastCreateSsh: __e2eLastCreateSshRequest,
    getCreateSshCallCount: __e2eCreateSshCallCount,
    getLastEnterDirectory: __e2eLastEnterDirectory,
    getLastPreviewOpen: __e2eLastPreviewOpen,
    getLastAiTerminalExec: __e2eLastAiTerminalExec,
    getLastAiLease: __e2eLastAiLease,
    getLastK8sApply: __e2eLastK8sApply,
    getLastKillProcess: __e2eLastKillProcess,
    resetUpload: __e2eResetUploadRequest,
    openSettings,
    invokeKillProcess,
    invokeK8sApplyYaml,
  };

  window.__TW_E2E__ = api;

  const scenario = import.meta.env.VITE_E2E_SCENARIO?.trim();
  const boot = () => {
    switch (scenario) {
      case "platform":
        void openAiPlatform();
        break;
      case "k8s":
        void openK8sWorkbench();
        break;
      case "ssh":
        openSshTab();
        break;
      case "localfs":
        openSshTab();
        openLocalFsPanel();
        break;
      case "home":
      default:
        openHome();
        break;
    }
  };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", () => setTimeout(boot, 50));
  } else {
    setTimeout(boot, 50);
  }
}
