import {
  E2E_SSH_SESSION_ID,
  e2eClusterSummary,
  e2eClusterTarget,
  e2eContexts,
  e2eFindResults,
  e2eHostStats,
  e2eLocalDir,
  e2eLocalRoots,
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

export function __e2eResetUploadRequest() {
  lastUploadRequest = null;
}

export function __e2eLastUploadRequest() {
  return lastUploadRequest;
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
  get_device_history: () => [],
  list_sessions: () => [sshSessionResult().session],
  create_ssh_session: () => sshSessionResult(),
  reconnect_ssh_session: () => sshSessionResult(),
  close_session: () => null,
  terminal_input: () => null,
  resize_terminal: () => null,
  insert_terminal_command: () => null,
  insert_local_paths_command: () => null,
  get_session_cwd: () => "/home/e2e",
  probe_remote_path: () => "file",
  enter_directory: () => "/home/e2e",
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
  find_files: () => e2eFindResults,
  list_local_roots: () => e2eLocalRoots,
  list_local_directory: () => e2eLocalDir,
  list_remote_directory: () => e2eRemoteDir,
  rename_local_path: () => null,
  move_local_path: () => null,
  delete_local_path: () => null,
  get_local_path_size: () => ({ path: "/tmp", kind: "directory", size_bytes: 1024 }),
  open_local_path: () => null,
  list_processes: () => e2eProcesses,
  kill_process: () => null,
  list_systemd_units: () => e2eSystemdUnits,
  list_passwd_accounts: () => [{ username: "e2e", uid: 1000, gid: 1000, home: "/home/e2e", shell: "/bin/bash" }],
  get_host_stats: () => e2eHostStats,
  preview_open: () => {
    previewHandleSeq += 1;
    return { handle_id: `preview-${previewHandleSeq}`, path: "/tmp/e2e-file.txt", kind: "text" };
  },
  preview_close: () => null,
  preview_save: () => null,
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
    ],
    security_mode: "safe",
  }),
  save_ai_settings: (args) => {
    const u = (args.update ?? args) as Record<string, unknown>;
    return {
      active_profile_id: "e2e-default",
      profiles: u.profiles ?? handlers.get_ai_settings?.({}) ?? [],
      security_mode: u.security_mode ?? "safe",
    };
  },
  ai_list_models: () => ({ models: ["qwen-test"], error: null }),
  ai_terminal_exec: () => ({
    command: "echo e2e",
    stdout: "e2e ok\n",
    stderr: "",
    exit_code: 0,
    timed_out: false,
    session_id: E2E_SSH_SESSION_ID,
  }),
  ai_register_privilege_lease: () => ({ ok: true, lease_id: "e2e-lease" }),
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
  k8s_delete_ssh_binding: () => null,
  k8s_list_namespaces: () => ["default", "demo", "kube-system"],
  k8s_list_resources: () => e2ePodRows,
  k8s_get_resource: () => ({
    kind: "Pod",
    namespace: "demo",
    name: "web-abc",
    yaml: "apiVersion: v1\nkind: Pod\nmetadata:\n  name: web-abc\n",
    overview: { Status: "Running", Node: "node-1" },
  }),
  k8s_apply_yaml: () => ({ ok: true, stdout: "", stderr: "", exit_code: 0 }),
  k8s_delete_resource: () => ({ ok: true, stdout: "", stderr: "", exit_code: 0 }),
  k8s_scale_resource: () => ({ ok: true, stdout: "", stderr: "", exit_code: 0 }),
  k8s_pod_logs: () => "e2e pod log line\n",
  k8s_pod_containers: () => ["app"],
  k8s_pod_shell_command: () => "kubectl exec -it ...",
  k8s_open_pod_shell_local: () => null,
  k8s_port_forward_start: () => ({ id: "pf-1", local_port: 18080, remote_port: 8080 }),
  k8s_port_forward_stop: () => null,
  k8s_port_forward_list: () => [],
  k8s_helm_list_releases: () => [{ name: "e2e-chart", namespace: "demo", status: "deployed", revision: "1" }],
  k8s_helm_get_values: () => "replicaCount: 1\n",
  k8s_list_crd_instances: () => [],
  k8s_tools_status: () => ({
    kubectl: { installed: true, version: "v1.28.0", bundled: true },
    helm: { installed: true, version: "v3.14.0", bundled: true },
  }),
  k8s_tools_install: () => null,
  k8s_cluster_summary: () => e2eClusterSummary,
  k8s_top_pods: () => [],
  k8s_kubectl_shell_command: () => "kubectl",
  k8s_open_kubectl_terminal: () => null,
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
