import { isE2eBrowserMode } from "./lib/e2eRuntime";
import { E2E_SSH_SESSION_ID } from "./e2e/fixtures";
import { __e2eEmitTerminalOutput, __e2eLastUploadRequest, __e2eResetUploadRequest } from "./e2e/tauriCoreMock";
import { useAiEngineerStore } from "./stores/aiEngineerStore";
import { useK8sStore } from "./stores/k8sStore";
import { useLocalFsStore } from "./stores/localFsStore";
import { useSidebarViewStore } from "./stores/sidebarViewStore";
import { focusManagedEntity } from "./stores/managedEntityStore";
import { useSessionStore } from "./stores/sessionStore";
import { switchWorkspacePanel } from "./stores/workspacePanelSwitch";
import type { TabSession } from "./types";

export interface TwE2eApi {
  openHome: () => void;
  openK8sWorkbench: () => Promise<void>;
  openSshTab: () => void;
  openLocalFsPanel: () => void;
  openAiPlatform: () => Promise<void>;
  openAiChat: () => Promise<void>;
  emitTerminalPrompt: (text?: string) => void;
  simulateTerminalDrop: (paths: string[]) => Promise<void>;
  getLastUpload: () => Record<string, unknown> | null;
  resetUpload: () => void;
}

declare global {
  interface Window {
    __TW_E2E__?: TwE2eApi;
  }
}

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

function openSshTab() {
  useSidebarViewStore.getState().setView("hosts");
  const tab: TabSession = {
    id: E2E_SSH_SESSION_ID,
    title: "e2e@127.0.0.1",
    kind: "ssh",
    active: true,
    connectionStatus: "ready",
    server_id: "e2e@127.0.0.1:22",
    remote_home: "/home/e2e",
    os_id: "linux",
    os_name: "Linux",
  };
  useSessionStore.setState({
    tabs: [tab],
    activeTabId: E2E_SSH_SESSION_ID,
  });
  focusManagedEntity({
    kind: "server",
    id: tab.server_id || tab.id,
    label: tab.title,
    sessionId: tab.id,
    serverId: tab.server_id,
  });
  window.setTimeout(() => {
    __e2eEmitTerminalOutput("Welcome e2e SSH session\r\ne2e@127.0.0.1:~$ ");
  }, 150);
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

function getLastUpload() {
  return __e2eLastUploadRequest();
}

function resetUpload() {
  __e2eResetUploadRequest();
}

/** Playwright / CI browser E2E helpers */
export function runE2eBootstrap(): void {
  if (!isE2eBrowserMode()) return;

  const api: TwE2eApi = {
    openHome,
    openK8sWorkbench,
    openSshTab,
    openLocalFsPanel,
    openAiPlatform,
    openAiChat,
    emitTerminalPrompt: (text = "e2e@127.0.0.1:~$ ") => {
      __e2eEmitTerminalOutput(`${text}\r\n`);
    },
    simulateTerminalDrop,
    getLastUpload,
    resetUpload,
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
