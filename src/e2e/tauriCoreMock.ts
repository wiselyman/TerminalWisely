import {
  E2E_SSH_SESSION_ID,
  e2eClusterSummary,
  e2eClusterTarget,
  e2eContexts,
  e2eDeploymentRows,
  e2eFindResults,
  e2eHostStats,
  e2eLocalDir,
  e2eLocalRoots,
  e2eNodeRows,
  e2ePodRows,
  e2eProcesses,
  e2eRemoteDir,
  e2eSavedConnection,
  e2eSystemdUnits,
} from "./fixtures";
import { e2eSidecarToken, e2eSidecarUrl, isE2eBrowserMode } from "../lib/e2eRuntime";

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
let lastAiTerminalExec: Record<string, unknown> | null = null;
let lastAiLease: Record<string, unknown> | null = null;
let lastK8sApply: Record<string, unknown> | null = null;
let lastKillProcess: Record<string, unknown> | null = null;
let lastK8sRolloutRestart: Record<string, unknown> | null = null;
let lastK8sHelmInstall: Record<string, unknown> | null = null;
let lastK8sOpenKubectlTerminal: Record<string, unknown> | null = null;
let lastK8sDelete: Record<string, unknown> | null = null;
let createSshCallCount = 0;

export function __e2eResetMocks() {
  lastUploadRequest = null;
  lastCreateSshRequest = null;
  lastEnterDirectory = null;
  lastPreviewOpen = null;
  lastAiTerminalExec = null;
  lastAiLease = null;
  lastK8sApply = null;
  lastKillProcess = null;
  lastK8sRolloutRestart = null;
  lastK8sHelmInstall = null;
  lastK8sOpenKubectlTerminal = null;
  lastK8sDelete = null;
  createSshCallCount = 0;
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

export function __e2eLastAiTerminalExec() {
  return lastAiTerminalExec;
}

export function __e2eLastAiLease() {
  return lastAiLease;
}

export function __e2eLastK8sApply() {
  return lastK8sApply;
}

export function __e2eLastKillProcess() {
  return lastKillProcess;
}

export function __e2eLastK8sRolloutRestart() {
  return lastK8sRolloutRestart;
}

export function __e2eLastK8sHelmInstall() {
  return lastK8sHelmInstall;
}

export function __e2eLastK8sOpenKubectlTerminal() {
  return lastK8sOpenKubectlTerminal;
}

export function __e2eLastK8sDelete() {
  return lastK8sDelete;
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
  get_saved_connections: () => [e2eSavedConnection],
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
  insert_terminal_command: () => null,
  insert_local_paths_command: () => null,
  get_session_cwd: () => "/home/e2e",
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
  list_local_directory: () => e2eLocalDir,
  list_remote_directory: () => e2eRemoteDir,
  rename_local_path: () => null,
  move_local_path: () => null,
  delete_local_path: () => null,
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
    const filename = path.split(/[/\\]/).pop() ?? "file";
    const extension = filename.includes(".")
      ? filename.slice(filename.lastIndexOf(".") + 1).toLowerCase()
      : "";
    const isMd = extension === "md" || extension === "markdown";
    return {
      handle_id: `preview-${previewHandleSeq}`,
      kind: isMd ? "markdown" : "text",
      session_id: String(req.session_id ?? "e2e-ssh-session"),
      resolved_path: path,
      filename,
      extension,
      total_size: 32,
      truncated: false,
      editable: true,
      text_content: isMd
        ? "# E2E Markdown\n\nUNIQUE_WYSIWYG_MARKER_42\n"
        : "e2e text content\n",
      local_cache_path: null,
      uses_sudo: false,
    };
  },
  preview_close: () => null,
  preview_save: () => null,
  preview_read_bytes: () => ({
    base64: "",
    mime_hint: "application/octet-stream",
  }),
  preview_write_bytes: () => null,
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
  k8s_discover_contexts: () => e2eContexts,
  k8s_list_ssh_bindings: () => [],
  k8s_list_imported_kubeconfigs: () => [],
  k8s_import_kubeconfig: () => e2eContexts,
  k8s_import_kubeconfig_yaml: () => e2eContexts,
  k8s_rename_imported_kubeconfig: () => e2eContexts,
  k8s_read_kubeconfig: () => "apiVersion: v1\nkind: Config\n",
  k8s_update_kubeconfig: () => e2eContexts,
  k8s_remove_imported_kubeconfig: () => null,
  k8s_probe_ssh_kubectl: () => ({ ok: true, version: "v1.28.0" }),
  k8s_save_ssh_binding: () => e2eClusterTarget,
  k8s_update_ssh_binding_session: () => null,
  k8s_delete_ssh_binding: () => null,
  k8s_list_namespaces: () => ["default", "demo", "kube-system"],
  k8s_list_resources: (args) => {
    const category = (args as { category?: string }).category;
    if (category === "nodes") return e2eNodeRows;
    if (category === "deployments") return e2eDeploymentRows;
    return e2ePodRows;
  },
  k8s_get_resource: () => ({
    kind: "Pod",
    namespace: "demo",
    name: "web-abc",
    yaml: [
      "apiVersion: v1",
      "kind: Pod",
      "metadata:",
      "  name: web-abc",
      "  ownerReferences:",
      "  - kind: StatefulSet",
      "    name: my-statefulset",
      "spec:",
      "  containers:",
      "  - name: web",
      "    ports:",
      "    - containerPort: 80",
      "      protocol: TCP",
      "      name: http",
      "    - containerPort: 443",
      "      protocol: TCP",
      "      name: https",
      "    volumeMounts:",
      "    - name: data",
      "      mountPath: /data",
      "    - name: tmp",
      "      mountPath: /tmp",
      "  volumes:",
      "  - name: data",
      "    persistentVolumeClaim:",
      "      claimName: web-data",
      "  - name: tmp",
      "    emptyDir: {}",
    ].join("\n"),
    overview: {
      Status: "Running",
      Node: "node-1",
      ownerRefs: "StatefulSet/my-statefulset",
    },
  }),
  k8s_apply_yaml: (args) => {
    lastK8sApply = args as Record<string, unknown>;
    return { ok: true, stdout: "", stderr: "", exit_code: 0 };
  },
  k8s_delete_resource: (args) => {
    lastK8sDelete = args as Record<string, unknown>;
    return { ok: true, stdout: "", stderr: "", exit_code: 0 };
  },
  k8s_scale_resource: () => ({ ok: true, stdout: "", stderr: "", exit_code: 0 }),
  k8s_cordon_node: () => ({ ok: true, stdout: "", stderr: "", exit_code: 0 }),
  k8s_uncordon_node: () => ({ ok: true, stdout: "", stderr: "", exit_code: 0 }),
  k8s_drain_node: () => ({ ok: true, stdout: "", stderr: "", exit_code: 0 }),
  k8s_node_shell_command: () =>
    "kubectl run tw-nsh-e2e0000 -n kube-system --restart=Never --rm -it --image=alpine:3.19 --overrides='{\"spec\":{\"nodeName\":\"ubuntu\"}}'",
  k8s_node_shell_start: () => ({ id: "e2e-node-shell", namespace: "", pod: "ubuntu" }),
  k8s_pod_logs: () => "e2e pod log line\n",
  k8s_pod_containers: () => ["app"],
  k8s_pod_shell_command: () => "kubectl exec -it ...",
  k8s_open_pod_shell_local: () => null,
  k8s_port_forward_start: () => ({ id: "pf-1", local_port: 18080, remote_port: 8080 }),
  k8s_port_forward_stop: () => null,
  k8s_port_forward_list: () => [],
  k8s_helm_list_releases: () => [{ name: "e2e-chart", namespace: "demo", status: "deployed", revision: "1", chart: "demo", app_version: "1.0" }],
  k8s_helm_get_values: () => "replicaCount: 1\n",
  k8s_helm_list_charts: () => [{ name: "stable/nginx", version: "1.0.0", app_version: "1.0", description: "nginx" }],
  k8s_helm_list_repos: () => [{ name: "stable", url: "https://example.com" }],
  k8s_helm_add_repo: () => ({ ok: true, stdout: "", stderr: "", exit_code: 0 }),
  k8s_helm_chart_values: () => "replicaCount: 1\n",
  k8s_helm_install: (args) => {
    lastK8sHelmInstall = args as Record<string, unknown>;
    return { ok: true, stdout: "", stderr: "", exit_code: 0 };
  },
  k8s_helm_upgrade: () => ({ ok: true, stdout: "", stderr: "", exit_code: 0 }),
  k8s_helm_rollback: () => ({ ok: true, stdout: "", stderr: "", exit_code: 0 }),
  k8s_helm_uninstall: () => ({ ok: true, stdout: "", stderr: "", exit_code: 0 }),
  k8s_rollout_restart: (args) => {
    lastK8sRolloutRestart = args as Record<string, unknown>;
    return { ok: true, stdout: "", stderr: "", exit_code: 0 };
  },
  k8s_list_crd_catalog: () => [
    { group: "traefik.io", kind: "IngressRoute", plural: "ingressroutes", name: "ingressroutes.traefik.io", scope: "Namespaced" },
  ],
  k8s_list_applications: () => [],
  k8s_list_crd_instances: () => [],
  k8s_tools_status: () => ({
    kubectl: { installed: true, version: "v1.28.0", bundled: true },
    helm: { installed: true, version: "v3.14.0", bundled: true },
  }),
  k8s_tools_install: () => null,
  k8s_cluster_summary: () => e2eClusterSummary,
  k8s_top_pods: () => [],
  k8s_kubectl_shell_command: () => "kubectl",
  k8s_kubectl_cluster_shell_start: () => ({
    id: "e2e-cluster-shell",
    namespace: "",
    pod: "e2e-k3s-local",
  }),
  k8s_open_kubectl_terminal: (args) => {
    lastK8sOpenKubectlTerminal = args as Record<string, unknown>;
    return null;
  },
  k8s_pod_shell_start: () => ({ session_id: "e2e-pod-shell" }),
  k8s_pod_shell_input: () => null,
  k8s_pod_shell_resize: () => null,
  k8s_pod_shell_stop: () => null,
  k8s_kubectl: () => ({ ok: true, stdout: "{}", stderr: "", exit_code: 0, parsed: {} }),
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
