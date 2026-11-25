import {
  E2E_SSH_SESSION_ID,
  e2eFindResults,
  e2eHostStats,
  e2eLocalDir,
  e2eLocalRoots,
  e2eProcesses,
  e2eRemoteDir,
  e2eSavedConnection,
  e2eSystemdUnits,
} from "./fixtures";
import { e2eSidecarToken, e2eSidecarUrl, isE2eBrowserMode } from "../lib/e2eRuntime";
import type { SavedConnection } from "../types";

type InvokeArgs = Record<string, unknown>;

/** Minimal Tauri IPC channel stub for browser E2E builds. */
export class Channel<T> {
  onmessage: ((message: T) => void) | null = null;
}

/** Rust-backed resource handle stub for Tauri plugins in E2E builds. */
export class Resource {
  readonly rid: number;
  constructor(rid: number) {
    this.rid = rid;
  }
  async close(): Promise<void> {
    await invoke("plugin:resources|close", { rid: this.rid });
  }
}

/** Asset URL helper used by preview components in E2E builds. */
export function convertFileSrc(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.replace(/\\/g, "/");
  return normalized.startsWith("asset://") ? normalized : `asset://localhost/${normalized}`;
}

let previewHandleSeq = 0;
let lastUploadRequest: Record<string, unknown> | null = null;
let lastCreateSshRequest: Record<string, unknown> | null = null;
let lastEnterDirectory: Record<string, unknown> | null = null;
let lastPreviewOpen: Record<string, unknown> | null = null;
let lastPreviewSave: Record<string, unknown> | null = null;
let previewPathsByHandle = new Map<string, string>();
let previewMarkdownByPath = new Map<string, string>();
let lastLocalBytesWrite: Record<string, unknown> | null = null;
let lastRemoteBytesWrite: Record<string, unknown> | null = null;
let localReadDelayMs = 0;
let failNextLocalRead = false;
let nextDialogSaveResult: string | null | undefined;
let nextDialogOpenResult: string | null | undefined;
let nextDialogAskResult: boolean | undefined;
let pandocInputFormats: string[] = [];
let pandocOutputFormats: string[] = [];
let lastPandocImport: Record<string, unknown> | null = null;
let failNextLocalWrite = false;
let createdRemotePaths: string[] = [];
let localFsEntries = e2eLocalDir.map((entry) => ({ ...entry }));
let localProcesses = [{ pid: 42001, name: "e2e-worker", command: "worker --local", cpu_percent: 1.2, memory_bytes: 2048, ports: [] as number[] }];
let localFsText = new Map<string, string>([["/tmp/e2e-file.txt", "local test contents"]]);
let lastAiTerminalExec: Record<string, unknown> | null = null;
let lastAiLease: Record<string, unknown> | null = null;
let lastKillProcess: Record<string, unknown> | null = null;
let lastTerminalCommand: Record<string, unknown> | null = null;
let createSshCallCount = 0;
let e2eSavedConnections: SavedConnection[] = [{ ...e2eSavedConnection }];
let nestedEditorTreeFixtureEnabled = false;

export function __e2eEnableNestedEditorTreeFixture() {
  nestedEditorTreeFixtureEnabled = true;
}

export function __e2eResetMocks() {
  lastUploadRequest = null;
  lastCreateSshRequest = null;
  lastEnterDirectory = null;
  lastPreviewOpen = null;
  lastPreviewSave = null;
  previewPathsByHandle = new Map();
  previewMarkdownByPath = new Map();
  lastLocalBytesWrite = null;
  lastRemoteBytesWrite = null;
  localReadDelayMs = 0;
  failNextLocalRead = false;
  nextDialogSaveResult = undefined;
  nextDialogOpenResult = undefined;
  nextDialogAskResult = undefined;
  pandocInputFormats = [];
  pandocOutputFormats = [];
  lastPandocImport = null;
  failNextLocalWrite = false;
  createdRemotePaths = [];
  localFsEntries = e2eLocalDir.map((entry) => ({ ...entry }));
  localProcesses = [{ pid: 42001, name: "e2e-worker", command: "worker --local", cpu_percent: 1.2, memory_bytes: 2048, ports: [] }];
  localFsText = new Map([["/tmp/e2e-file.txt", "local test contents"]]);
  lastAiTerminalExec = null;
  lastAiLease = null;
  lastKillProcess = null;
  lastTerminalCommand = null;
  createSshCallCount = 0;
  e2eSavedConnections = [{ ...e2eSavedConnection }];
  nestedEditorTreeFixtureEnabled = false;
}

export function __e2eResetUploadRequest() {
  lastUploadRequest = null;
}

export function __e2eLastUploadRequest() {
  return lastUploadRequest;
}

export function __e2eLastCreateSshRequest() {
  return lastCreateSshRequest;
}

export function __e2eCreateSshCallCount() {
  return createSshCallCount;
}

export function __e2eLastEnterDirectory() {
  return lastEnterDirectory;
}

export function __e2eLastPreviewOpen() {
  return lastPreviewOpen;
}

export function __e2eLastPreviewSave() {
  return lastPreviewSave;
}

export function __e2eLastLocalBytesWrite() {
  return lastLocalBytesWrite;
}

export function __e2eLastRemoteBytesWrite() {
  return lastRemoteBytesWrite;
}

export function __e2eSetNextDialogSaveResult(path: string | null) {
  nextDialogSaveResult = path;
}

export function __e2eSetNextDialogOpenResult(path: string | null) {
  nextDialogOpenResult = path;
}

export function __e2eSetPandocFormats(input: string[], output: string[]) {
  pandocInputFormats = input;
  pandocOutputFormats = output;
}

export function __e2eLastPandocImport() {
  return lastPandocImport;
}

export function __e2eFailNextLocalWrite() {
  failNextLocalWrite = true;
}

export function __e2eLocalText(path: string) {
  return localFsText.get(path) ?? null;
}

export function __e2eSeedLocalText(path: string, text: string) {
  localFsText.set(path, text);
  const name = path.split(/[\\/]/).pop() ?? path;
  if (!localFsEntries.some((entry) => entry.path === path)) {
    localFsEntries.push({ name, path, kind: "file", size_bytes: text.length });
  }
}

export function __e2eSetLocalReadDelay(milliseconds: number) {
  localReadDelayMs = Math.max(0, milliseconds);
}

export function __e2eFailNextLocalRead() {
  failNextLocalRead = true;
}

export function __e2eLastAiTerminalExec() {
  return lastAiTerminalExec;
}

export function __e2eLastAiLease() {
  return lastAiLease;
}

export function __e2eLastKillProcess() {
  return lastKillProcess;
}

export function __e2eLastTerminalCommand() {
  return lastTerminalCommand;
}

export function __e2eSeedRemotePath(path: string) {
  createdRemotePaths.push(path);
}

async function sidecarHttpProxy(args: InvokeArgs): Promise<{
  status: number;
  body: string;
  content_type: string;
}> {
  const req = (args.request ?? args) as {
    method?: string;
    path?: string;
    body?: string | null;
  };
  const method = (req.method ?? "GET").toUpperCase();
  const path = req.path ?? "/";
  const url = `${e2eSidecarUrl().replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${e2eSidecarToken()}`,
      "Content-Type": "application/json",
    },
    body: req.body ?? undefined,
  });
  const body = await res.text();
  return {
    status: res.status,
    body,
    content_type: res.headers.get("content-type") ?? "application/json",
  };
}

function sshSessionResult() {
  return {
    session: {
      id: E2E_SSH_SESSION_ID,
      title: "e2e@127.0.0.1",
      kind: "ssh",
      remote_home: "/home/e2e",
      server_id: "e2e@127.0.0.1:22",
      os_id: "linux",
      os_name: "Linux",
    },
    os_id: "linux",
    os_name: "Linux",
  };
}

const handlers: Record<string, (args: InvokeArgs) => unknown | Promise<unknown>> = {
  get_app_version: () => "0.0.3-e2e",
  get_update_target: () => "e2e",
  get_default_download_dir: () => "/tmp",
  get_saved_connections: () => e2eSavedConnections,
  update_saved_connection: (args) => {
    const { id, name, request } = args as { id: string; name: string; request: Record<string, unknown> };
    e2eSavedConnections = e2eSavedConnections.map((saved) => saved.id === id ? {
      ...saved,
      name,
      host: String(request.host ?? saved.host),
      port: Number(request.port ?? saved.port),
      username: String(request.username ?? saved.username),
      auth_method: String(request.auth_method ?? saved.auth_method) as SavedConnection["auth_method"],
    } : saved);
    return null;
  },
  delete_saved_connection: (args) => {
    const { id } = args as { id: string };
    e2eSavedConnections = e2eSavedConnections.filter((saved) => saved.id !== id);
    return null;
  },
  reorder_saved_connections: () => null,
  get_device_history: () => [],
  list_sessions: () => [sshSessionResult().session],
  create_ssh_session: (args) => {
    const req = (args as { request?: Record<string, unknown> }).request ?? (args as Record<string, unknown>);
    lastCreateSshRequest = req;
    createSshCallCount += 1;
    return sshSessionResult();
  },
  connect_saved: (args) => {
    lastCreateSshRequest = args as Record<string, unknown>;
    createSshCallCount += 1;
    return sshSessionResult();
  },
  connect_device: (args) => {
    lastCreateSshRequest = args as Record<string, unknown>;
    createSshCallCount += 1;
    return sshSessionResult();
  },
  reconnect_ssh_session: () => sshSessionResult(),
  set_ai_ssh_lease: () => null,
  close_session: () => null,
  browser_ensure: (args) => {
    const req =
      (args as { request?: { session_id?: string } }).request ??
      (args as { session_id?: string });
    const sessionId = String(req.session_id ?? E2E_SSH_SESSION_ID);
    return {
      session_id: sessionId,
      profile_key: "e2e@127.0.0.1:22",
      socks_port: 1080,
      webview_label: "host-browser-e2e-127-0-0-1-22",
      created: true,
    };
  },
  browser_local_ensure: () => ({
    profile_key: "local",
    webview_label: "local-browser-e2e",
    created: true,
  }),
  browser_local_activate_tab: () => ({
    profile_key: "local",
    webview_label: "local-browser-e2e",
    created: false,
  }),
  browser_local_navigate: (args) => {
    const req = (args as { request?: Record<string, unknown> }).request ?? (args as Record<string, unknown>);
    const url = String(req.url ?? "");
    const tabId = String(req.tab_id ?? "default");
    const label = "local-browser-e2e";
    void import("./tauriEventMock").then(({ __emitTauriEvent }) => {
      __emitTauriEvent("host-browser-load", { webview_label: label, profile_key: "local", tab_id: tabId, url, phase: "started" });
      queueMicrotask(() => {
        __emitTauriEvent("host-browser-load", { webview_label: label, profile_key: "local", tab_id: tabId, url, phase: "finished" });
        __emitTauriEvent("host-browser-page", { webview_label: label, profile_key: "local", tab_id: tabId, url, title: url, favicon: "" });
      });
    });
    return null;
  },
  browser_local_close_tab: () => null,
  browser_navigate: (args) => {
    const req =
      (args as { request?: Record<string, unknown> }).request ??
      (args as Record<string, unknown>);
    const url = String(req.url ?? "");
    const tabId = String(req.tab_id ?? "default");
    const profileKey = String(req.profile_key ?? "e2e@127.0.0.1:22");
    // Match browser_ensure mock label so FE load listener accepts the event.
    const label = "host-browser-e2e-127-0-0-1-22";
    void import("./tauriEventMock").then(({ __emitTauriEvent }) => {
      __emitTauriEvent("host-browser-load", {
        webview_label: label,
        profile_key: profileKey,
        tab_id: tabId,
        url,
        phase: "started",
      });
      queueMicrotask(() => {
        __emitTauriEvent("host-browser-load", {
          webview_label: label,
          profile_key: profileKey,
          tab_id: tabId,
          url,
          phase: "finished",
        });
        let favicon = "";
        try {
          if (url.startsWith("http")) favicon = `${new URL(url).origin}/favicon.ico`;
        } catch {
          favicon = "";
        }
        __emitTauriEvent("host-browser-page", {
          webview_label: label,
          profile_key: profileKey,
          tab_id: tabId,
          url,
          title: url.includes("baidu") ? "百度一下" : url,
          favicon,
        });
      });
    });
    return null;
  },
  browser_shutdown: () => null,
  browser_set_webview_bounds: () => null,
  browser_set_visible: () => null,
  browser_hide_all: () => null,
  browser_hide_session: () => null,
  browser_activate_tab: () => ({
    session_id: "e2e-session",
    profile_key: "e2e@mock:22",
    socks_port: 0,
    webview_label: "host-browser-e2e",
    created: false,
  }),
  browser_close_tab: () => null,
  browser_back: () => null,
  browser_forward: () => null,
  browser_reload: (args) => {
    const req =
      (args as { request?: Record<string, unknown> }).request ??
      (args as Record<string, unknown>);
    const label = String(req.webview_label ?? "host-browser-e2e");
    void import("./tauriEventMock").then(({ __emitTauriEvent }) => {
      __emitTauriEvent("host-browser-load", {
        webview_label: label,
        profile_key: "e2e@127.0.0.1:22",
        tab_id: "default",
        url: "http://127.0.0.1:8080/",
        phase: "started",
      });
      queueMicrotask(() => {
        __emitTauriEvent("host-browser-load", {
          webview_label: label,
          profile_key: "e2e@127.0.0.1:22",
          tab_id: "default",
          url: "http://127.0.0.1:8080/",
          phase: "finished",
        });
      });
    });
    return null;
  },
  browser_history_list: () => [
    {
      url: "http://127.0.0.1:8080/",
      title: "Local",
      profile_key: "e2e@127.0.0.1:22",
      visited_at: Date.now(),
    },
  ],
  browser_history_record: () => null,
  browser_history_clear: () => null,
  browser_bookmarks_list: () => [],
  browser_bookmark_upsert: (args) => {
    const req =
      (args as { request?: Record<string, string> }).request ??
      (args as Record<string, string>);
    return {
      id: "e2e-bm-1",
      url: String(req.url ?? ""),
      title: String(req.title ?? req.url ?? ""),
      profile_key: String(req.profile_key ?? "e2e@127.0.0.1:22"),
      created_at: Date.now(),
    };
  },
  browser_bookmark_remove: () => null,
  terminal_input: () => null,
  resize_terminal: () => null,
  insert_terminal_command: (args) => {
    lastTerminalCommand = (args as { request?: Record<string, unknown> }).request ?? null;
    return null;
  },
  insert_local_paths_command: () => null,
  get_session_cwd: () => "/home/e2e",
  "plugin:dialog|save": (args) => {
    if (nextDialogSaveResult !== undefined) {
      const result = nextDialogSaveResult;
      nextDialogSaveResult = undefined;
      return result;
    }
    const options = (args as { options?: Record<string, unknown> }).options ?? args as Record<string, unknown>;
    const defaultPath = String(options.defaultPath ?? "export.html");
    const extension = defaultPath.split(".").pop() || "html";
    return `/tmp/markwisely-toolbar-export.${extension}`;
  },
  "plugin:dialog|open": () => {
    const result = nextDialogOpenResult ?? null;
    nextDialogOpenResult = undefined;
    return result;
  },
  "plugin:dialog|message": () => {
    const result = nextDialogAskResult ?? "Yes";
    nextDialogAskResult = undefined;
    return result;
  },
  markdown_pandoc_formats: () => pandocOutputFormats,
  markdown_pandoc_input_formats: () => pandocInputFormats,
  markdown_pandoc_import_file: (args) => {
    lastPandocImport = args as Record<string, unknown>;
    return "# Imported from Word\n\nConverted using the E2E Pandoc adapter.";
  },
  markdown_pandoc_cancel: () => true,
  markdown_pandoc_convert: () => "# Pandoc export fixture",
  probe_remote_path: (args) => {
    const path = String((args as { path?: string }).path ?? "");
    if (path.endsWith("/") || path.includes("bin")) return "directory";
    return "file";
  },
  enter_directory: (args) => {
    lastEnterDirectory = (args as { request?: Record<string, unknown> }).request ?? (args as Record<string, unknown>);
    const path = String(lastEnterDirectory.remote_path ?? "/home/e2e");
    return path;
  },
  upload_files: (args) => {
    const req = (args as { request?: Record<string, unknown> }).request ?? (args as Record<string, unknown>);
    lastUploadRequest = req;
    const localPaths = (req.local_paths as string[] | undefined) ?? [];
    const first = localPaths[0] ?? "/tmp/e2e.txt";
    const filename = first.split(/[/\\]/).pop() ?? "e2e.txt";
    const remoteDir = (req.remote_dir as string | undefined) ?? "/home/e2e";
    return [
      {
        filename,
        remote_path: `${remoteDir.replace(/\/$/, "")}/${filename}`,
        local_path: first,
      },
    ];
  },
  download_file: () => null,
  download_directory: () => null,
  cancel_transfer: () => null,
  transfer_remote_file: () => null,
  rename_path: () => null,
  create_path: (args) => {
    const request = (args as { request?: Record<string, unknown> }).request ?? (args as Record<string, unknown>);
    const parentDir = String(request.parent_dir ?? "").replace(/\/$/, "");
    const name = String(request.name ?? "");
    if (name) createdRemotePaths.push(`${parentDir}/${name}`);
    return null;
  },
  move_path: () => null,
  delete_path: () => null,
  compress_path: () => null,
  extract_archive: () => null,
  get_path_size: () => ({ path: "/home/e2e", kind: "directory", size_bytes: 4096 }),
  complete_path: () => [],
  find_files: () => ({
    entries: e2eFindResults,
    truncated: false,
    start_path: "/home/e2e",
  }),
  list_local_roots: () => e2eLocalRoots,
  list_local_directory: (args) => {
    const req = args as { path?: string };
    const path = req.path || "/tmp";
    return {
      path,
      parent: path === "/" ? null : path === "/tmp" ? "/" : "/tmp",
      entries: localFsEntries.filter((entry) => entry.path.slice(0, entry.path.lastIndexOf("/")) === path),
    };
  },
  list_local_processes: () => ({ processes: localProcesses }),
  kill_local_process: (args) => {
    const request = args as { pid: number };
    localProcesses = localProcesses.filter((process) => process.pid !== request.pid);
    return null;
  },
  create_local_path: (args) => {
    const request = (args as { request: { parent: string; name: string; kind: string } }).request;
    const path = `${request.parent.replace(/\/$/, "")}/${request.name}`;
    localFsEntries.push({ name: request.name, path, kind: request.kind, size_bytes: 0 });
    if (request.kind === "file") localFsText.set(path, "");
    return path;
  },
  read_local_text: async (args) => {
    const path = (args as { request: { path: string } }).request.path;
    if (localReadDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, localReadDelayMs));
    if (!localFsText.has(path)) throw new Error("Not a text file");
    return localFsText.get(path);
  },
  read_local_file_prefix: (args) => {
    const path = (args as { request: { path: string } }).request.path;
    return (localFsText.get(path) ?? "").split(/\r?\n/, 1)[0].slice(0, 256);
  },
  read_local_bytes: async (args) => {
    const path = (args as { request: { path: string } }).request.path;
    if (failNextLocalRead) { failNextLocalRead = false; throw new Error("Mock local read failed"); }
    if (localReadDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, localReadDelayMs));
    return Array.from(new TextEncoder().encode(localFsText.get(path) ?? ""));
  },
  write_local_text: (args) => {
    const request = (args as { request: { path: string; content: string } }).request;
    if (failNextLocalWrite) { failNextLocalWrite = false; throw new Error("Mock local write failed"); }
    localFsText.set(request.path, request.content);
    return null;
  },
  write_local_bytes: (args) => {
    const request = (args as { request: { path: string; base64: string } }).request;
    if (failNextLocalWrite) { failNextLocalWrite = false; throw new Error("Mock local write failed"); }
    lastLocalBytesWrite = request;
    localFsText.set(request.path, new TextDecoder().decode(Uint8Array.from(atob(request.base64), (value) => value.charCodeAt(0))));
    return null;
  },
  save_local_bytes_as: (args) => {
    const request = (args as { request: { path: string; base64: string } }).request;
    if (failNextLocalWrite) { failNextLocalWrite = false; throw new Error("Mock local write failed"); }
    lastLocalBytesWrite = request;
    localFsText.set(request.path, new TextDecoder().decode(Uint8Array.from(atob(request.base64), (value) => value.charCodeAt(0))));
    return null;
  },
  list_remote_directory: (args) => {
    const request = (args as { request?: { path?: string } }).request;
    const path = request?.path === "/" ? "/" : request?.path ?? "/home/e2e";
    const nestedTree: Record<string, Array<{ name: string; path: string; kind: "directory" | "file"; size_bytes: number }>> = {
      "/home/e2e/editor-tree-fixture": [
        { name: "src", path: "/home/e2e/editor-tree-fixture/src", kind: "directory", size_bytes: 0 },
      ],
      "/home/e2e/editor-tree-fixture/src": [
        { name: "vision", path: "/home/e2e/editor-tree-fixture/src/vision", kind: "directory", size_bytes: 0 },
      ],
      "/home/e2e/editor-tree-fixture/src/vision": [
        { name: "vision_pipeline.cpp", path: "/home/e2e/editor-tree-fixture/src/vision/vision_pipeline.cpp", kind: "file", size_bytes: 32 },
      ],
    };
    if (nestedTree[path] && nestedEditorTreeFixtureEnabled) {
      return { path, parent: path.slice(0, path.lastIndexOf("/")) || "/", entries: nestedTree[path] };
    }
    const createdEntries = createdRemotePaths
      .map((filePath) => ({
        name: filePath.split("/").pop() ?? filePath,
        path: filePath,
        kind: "file" as const,
        size_bytes: 0,
      }));
    const fixtureRoot = path === "/home/e2e" && nestedEditorTreeFixtureEnabled
      ? [{ name: "editor-tree-fixture", path: "/home/e2e/editor-tree-fixture", kind: "directory" as const, size_bytes: 0 }]
      : [];
    return { path, parent: path === "/" ? null : "/home", entries: [...e2eRemoteDir, ...createdEntries, ...fixtureRoot] };
  },
  read_remote_file_prefix: (args) => {
    const path = (args as { request: { path: string } }).request.path;
    return path.endsWith(".sh") ? "#!/bin/bash" : path.endsWith(".task") ? "#!/usr/bin/env node" : "";
  },
  rename_local_path: (args) => {
    const request = (args as { request: { path: string; new_name: string } }).request;
    const path = request.path;
    const next = `${path.slice(0, path.lastIndexOf("/"))}/${request.new_name}`;
    localFsEntries = localFsEntries.map((entry) => entry.path === path ? { ...entry, path: next, name: request.new_name } : entry);
    const content = localFsText.get(path);
    if (content != null) { localFsText.delete(path); localFsText.set(next, content); }
    return next;
  },
  move_local_path: (args) => {
    const request = (args as { request: { path: string; dest_dir: string } }).request;
    const path = request.path;
    const name = path.split("/").pop() ?? "";
    const next = `${request.dest_dir.replace(/\/$/, "")}/${name}`;
    localFsEntries = localFsEntries.map((entry) => entry.path === path ? { ...entry, path: next } : entry);
    const content = localFsText.get(path);
    if (content != null) { localFsText.delete(path); localFsText.set(next, content); }
    return next;
  },
  copy_local_path: (args) => {
    const request = (args as { request: { path: string; dest_dir: string; name?: string | null } }).request;
    const source = localFsEntries.find((entry) => entry.path === request.path);
    if (!source) throw new Error("Source path does not exist");
    const name = request.name || source.name;
    const next = `${request.dest_dir.replace(/\/$/, "")}/${name}`;
    if (localFsEntries.some((entry) => entry.path === next)) throw new Error("Destination already exists");
    localFsEntries.push({ ...source, name, path: next });
    const content = localFsText.get(request.path);
    if (content != null) localFsText.set(next, content);
    return next;
  },
  delete_local_path: (args) => {
    const path = (args as { request: { path: string } }).request.path;
    localFsEntries = localFsEntries.filter((entry) => entry.path !== path && !entry.path.startsWith(`${path}/`));
    localFsText.delete(path);
    return null;
  },
  trash_local_path: (args) => {
    const path = (args as { request: { path: string } }).request.path;
    localFsEntries = localFsEntries.filter((entry) => entry.path !== path && !entry.path.startsWith(`${path}/`));
    localFsText.delete(path);
    return null;
  },
  get_local_path_size: () => ({ path: "/tmp", kind: "directory", size_bytes: 1024 }),
  open_local_path: () => null,
  reveal_local_path: () => null,
  list_processes: () => e2eProcesses,
  kill_process: (args) => {
    lastKillProcess = (args as { request?: Record<string, unknown> }).request ?? (args as Record<string, unknown>);
    return null;
  },
  list_systemd_units: () => e2eSystemdUnits,
  list_passwd_accounts: () => [{ username: "e2e", uid: 1000, gid: 1000, home: "/home/e2e", shell: "/bin/bash" }],
  get_host_stats: () => e2eHostStats,
  preview_open: (args) => {
    previewHandleSeq += 1;
    const req = (args as { request?: Record<string, unknown> }).request ?? (args as Record<string, unknown>);
    lastPreviewOpen = req;
    const path = String(req.path ?? "/tmp/e2e-file.txt");
    if (path.endsWith("/broken.pdf")) throw new Error("Mock preview load failed");
    const filename = path.split(/[/\\]/).pop() ?? "file";
    const extension = filename.includes(".")
      ? filename.slice(filename.lastIndexOf(".") + 1).toLowerCase()
      : "";
    const isMd = extension === "md" || extension === "markdown";
    const isPdf = extension === "pdf";
    const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension);
    const handleId = `preview-${previewHandleSeq}`;
    previewPathsByHandle.set(handleId, path);
    return {
      handle_id: handleId,
      kind: isPdf ? "pdf" : isImage ? "image" : isMd ? "markdown" : "text",
      session_id: String(req.session_id ?? "e2e-ssh-session"),
      resolved_path: path,
      filename,
      extension,
      total_size: 32,
      truncated: false,
      editable: !isPdf && !isImage,
      text_content: isMd
        ? previewMarkdownByPath.get(path) ?? (path.endsWith("/links.md")
          ? "# Link test\n\n[Related document](related.md)\n\n## Details\n\n[Jump to details](#details)\n"
          : "# E2E Markdown\n\nUNIQUE_WYSIWYG_MARKER_42\n")
        : "e2e text content\n",
      local_cache_path: isPdf || isImage ? `/tmp/e2e-preview/${filename}` : null,
      uses_sudo: false,
    };
  },
  preview_close: () => null,
  preview_save: (args) => {
    lastPreviewSave = (args as { request?: Record<string, unknown> }).request ?? (args as Record<string, unknown>);
    const request = lastPreviewSave;
    const path = previewPathsByHandle.get(String(request.handle_id ?? ""));
    if (path && typeof request.content === "string") previewMarkdownByPath.set(path, request.content);
    return null;
  },
  preview_read_bytes: () => ({
    base64: btoa("remote text\n"),
    mime_hint: "text/plain",
  }),
  preview_write_bytes: (args) => {
    lastRemoteBytesWrite = (args as { request: Record<string, unknown> }).request;
    const request = lastRemoteBytesWrite as { base64?: string };
    if (request.base64) lastRemoteBytesWrite.content = new TextDecoder().decode(Uint8Array.from(atob(request.base64), (c) => c.charCodeAt(0)));
    return null;
  },
  probe_path: () => "file",
  open_preview_path: () => null,
  open_preview_handle: () => null,
  ensure_ai_sidecar: () => ({
    base_url: e2eSidecarUrl(),
    token: e2eSidecarToken(),
    pid: 0,
  }),
  ai_sidecar_request: (args) => sidecarHttpProxy(args),
  ai_sidecar_stream: async (args) => {
    const onEvent = (args?.onEvent ?? (args as InvokeArgs)?.onEvent) as
      | Channel<{ type: string; payload?: Record<string, unknown> }>
      | undefined;
    if (onEvent?.onmessage) {
      onEvent.onmessage({
        type: "stream_end",
        payload: { status: "completed" },
      });
    }
    return null;
  },
  get_ai_settings: () => ({
    active_profile_id: "e2e-default",
    agent_runtime: "builtin",
    profiles: [
      {
        id: "e2e-default",
        name: "E2E",
        provider: "ollama",
        model: "qwen-test",
        ollama_base_url: "http://127.0.0.1:11434",
        base_url: "",
        has_api_key: false,
      },
      {
        id: "e2e-alt",
        name: "E2E Alt",
        provider: "ollama",
        model: "alt-test",
        ollama_base_url: "http://127.0.0.1:11434",
        base_url: "",
        has_api_key: false,
      },
    ],
    security_mode: "safe",
  }),
  save_ai_settings: (args) => {
    const u = (args.update ?? args) as Record<string, unknown>;
    const cur = handlers.get_ai_settings?.({}) as {
      profiles: unknown[];
      security_mode: string;
      agent_runtime?: string;
      active_profile_id?: string;
    };
    return {
      active_profile_id:
        (u.active_profile_id as string) ??
        cur?.active_profile_id ??
        "e2e-default",
      agent_runtime:
        (u.agent_runtime as string) ?? cur?.agent_runtime ?? "builtin",
      profiles: u.profiles ?? cur?.profiles ?? [],
      security_mode: u.security_mode ?? cur?.security_mode ?? "safe",
    };
  },
  ai_list_models: () => ({ models: ["qwen-test"], error: null }),
  ai_local_exec: (args) => {
    const request = (args as { request?: Record<string, unknown> }).request ?? {};
    return {
      command: String(request.command ?? "echo e2e"),
      stdout: "e2e local\n",
      stderr: "",
      exit_code: 0,
      timed_out: false,
      session_id: "local",
    };
  },
  ai_terminal_exec: (args) => {
    lastAiTerminalExec = (args as { request?: Record<string, unknown> }).request ?? (args as Record<string, unknown>);
    return {
      command: String(lastAiTerminalExec.command ?? "echo e2e"),
      stdout: "e2e ok\n",
      stderr: "",
      exit_code: 0,
      timed_out: false,
      session_id: E2E_SSH_SESSION_ID,
    };
  },
  ai_register_privilege_lease: (args) => {
    lastAiLease = (args as { request?: Record<string, unknown> }).request ?? (args as Record<string, unknown>);
    return { ok: true, lease_id: "e2e-lease" };
  },
  "plugin:resources|close": () => null,

};

export async function invoke<T>(cmd: string, args?: InvokeArgs): Promise<T> {
  if (!isE2eBrowserMode()) {
    throw new Error(`E2E mock invoke called outside VITE_E2E: ${cmd}`);
  }
  const fn = handlers[cmd];
  if (!fn) {
    console.warn(`[e2e mock] unhandled invoke: ${cmd}`, args);
    return undefined as T;
  }
  return (await fn(args ?? {})) as T;
}

export function __e2eEmitTerminalOutput(data: string, sessionId = E2E_SSH_SESSION_ID) {
  import("./tauriEventMock").then(({ __emitTauriEvent }) => {
    __emitTauriEvent("terminal-output", { session_id: sessionId, data });
  });
}
