import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../isTauri";
import {
  e2eSidecarToken,
  e2eSidecarUrl,
  isE2eBrowserMode,
} from "../e2eRuntime";

export interface SidecarInfo {
  base_url: string;
  token: string;
  pid: number;
}

export interface AiModelProfile {
  id: string;
  name: string;
  provider: string;
  model: string;
  ollama_base_url: string;
  base_url: string;
  has_api_key: boolean;
  api_key?: string;
}

export interface AiSettingsView {
  active_profile_id: string;
  profiles: AiModelProfile[];
  security_mode?: string;
}

export interface AiSettingsUpdate {
  active_profile_id?: string;
  profiles?: AiModelProfile[];
  security_mode?: string;
}

const E2E_DEFAULT_SETTINGS: AiSettingsView = {
  active_profile_id: "e2e-default",
  profiles: [
    {
      id: "e2e-default",
      name: "E2E Ollama",
      provider: "ollama",
      model: "qwen-test",
      ollama_base_url: "http://127.0.0.1:11434",
      base_url: "",
      has_api_key: false,
    },
  ],
  security_mode: "safe",
};

let e2eSettingsCache: AiSettingsView = { ...E2E_DEFAULT_SETTINGS, profiles: [...E2E_DEFAULT_SETTINGS.profiles] };

export async function ensureSidecar(): Promise<SidecarInfo> {
  if (isE2eBrowserMode()) {
    return {
      base_url: e2eSidecarUrl(),
      token: e2eSidecarToken(),
      pid: 0,
    };
  }
  return invoke<SidecarInfo>("ensure_ai_sidecar");
}

export async function getAiSettings(): Promise<AiSettingsView> {
  if (isE2eBrowserMode()) return e2eSettingsCache;
  return invoke<AiSettingsView>("get_ai_settings");
}

export async function saveAiSettings(
  update: AiSettingsUpdate,
): Promise<AiSettingsView> {
  if (isE2eBrowserMode()) {
    e2eSettingsCache = {
      ...e2eSettingsCache,
      ...update,
      profiles: update.profiles ?? e2eSettingsCache.profiles,
    };
    return e2eSettingsCache;
  }
  return invoke<AiSettingsView>("save_ai_settings", { update });
}

export interface AiListModelsRequest {
  provider: string;
  base_url?: string;
  ollama_base_url?: string;
  profile_id?: string | null;
  api_key?: string | null;
  configured_model?: string | null;
}

export interface AiListModelsResponse {
  models: string[];
  error?: string | null;
  resolved_model?: string | null;
  auto_corrected?: boolean;
}

export async function listAiModels(
  request: AiListModelsRequest,
): Promise<AiListModelsResponse> {
  return invoke<AiListModelsResponse>("ai_list_models", { request });
}

type SidecarHttpResult = {
  status: number;
  body: string;
  content_type: string;
};

/** All sidecar HTTP goes through Rust in Tauri (WKWebView fetch is unreliable). */
export async function sidecarFetch(
  info: SidecarInfo,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  if (isE2eBrowserMode()) {
    if (init?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const url = `${info.base_url.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${info.token}`);
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(url, { ...init, headers });
  }
  if (isTauriRuntime()) {
    if (init?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const method = (init?.method ?? "GET").toUpperCase();
    const body =
      typeof init?.body === "string"
        ? init.body
        : init?.body != null
          ? String(init.body)
          : null;
    const result = await invoke<SidecarHttpResult>("ai_sidecar_request", {
      request: {
        method,
        path,
        body,
        timeout_ms: method === "POST" && path.includes("/chat/start") ? 60_000 : 60_000,
      },
    });
    return new Response(result.body, {
      status: result.status || 502,
      headers: { "Content-Type": result.content_type || "application/json" },
    });
  }
  throw new Error("AI sidecar requires Tauri runtime");
}

export async function aiTerminalExec(opts: {
  sessionId: string;
  command: string;
  callId?: string;
  sudo?: boolean;
  sudoPassword?: string;
  leaseId?: string;
  requiresLease?: boolean;
}): Promise<{
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  timed_out: boolean;
  session_id: string;
}> {
  return invoke("ai_terminal_exec", {
    request: {
      session_id: opts.sessionId,
      command: opts.command,
      call_id: opts.callId ?? null,
      sudo: opts.sudo ?? false,
      sudo_password: opts.sudoPassword ?? null,
      lease_id: opts.leaseId ?? null,
      requires_lease: opts.requiresLease ?? false,
    },
  });
}

export async function aiRegisterPrivilegeLease(opts: {
  leaseId: string;
  sessionId: string;
  command: string;
  expiresAtEpochS: number;
  maxExecutions?: number;
}): Promise<{ ok: boolean; lease_id: string }> {
  return invoke("ai_register_privilege_lease", {
    request: {
      lease_id: opts.leaseId,
      session_id: opts.sessionId,
      command: opts.command,
      expires_at_epoch_s: opts.expiresAtEpochS,
      max_executions: opts.maxExecutions ?? 1,
    },
  });
}

export interface TraceSpanRow {
  id: string;
  kind: string;
  name: string;
  duration_ms?: number | null;
  started_at?: number;
  ended_at?: number | null;
}

export async function fetchRunTrace(
  sidecar: SidecarInfo,
  sessionId: string,
  runId: string,
): Promise<{ spans: TraceSpanRow[] }> {
  const res = await sidecarFetch(
    sidecar,
    `/v1/runs/${encodeURIComponent(runId)}/trace?session_id=${encodeURIComponent(sessionId)}`,
  );
  if (!res.ok) throw new Error(`Trace fetch failed (${res.status})`);
  return res.json() as Promise<{ spans: TraceSpanRow[] }>;
}

export interface UserSkillRow {
  id: string;
  title: string;
  path: string;
}

export interface UserSkillsCatalog {
  count: number;
  root: string;
  engineer_mode?: string;
  skills: UserSkillRow[];
}

export async function fetchUserSkills(
  sidecar: SidecarInfo,
  engineerMode: "linux" | "k8s" = "linux",
): Promise<UserSkillsCatalog> {
  const q = new URLSearchParams({ engineer_mode: engineerMode });
  const res = await sidecarFetch(sidecar, `/v1/skills?${q}`);
  if (!res.ok) throw new Error(`Skills list failed (${res.status})`);
  return res.json() as Promise<UserSkillsCatalog>;
}

export interface MemoryHostRow {
  scope: string;
  path: string;
  prefs: number;
  facts: number;
  notes: number;
}

export interface MemoryMetaCatalog {
  engineer_mode?: string;
  data_dir: string;
  memory_dir?: string;
  user_path: string;
  hosts_dir: string;
  targets_dir?: string;
  user: { path: string; prefs: number; notes: number };
  hosts: MemoryHostRow[];
  host_count: number;
}

export async function fetchMemoryMeta(
  sidecar: SidecarInfo,
  engineerMode: "linux" | "k8s" = "linux",
): Promise<MemoryMetaCatalog> {
  const q = new URLSearchParams({ engineer_mode: engineerMode });
  const res = await sidecarFetch(sidecar, `/v1/memory/meta?${q}`);
  if (!res.ok) throw new Error(`Memory meta failed (${res.status})`);
  return res.json() as Promise<MemoryMetaCatalog>;
}

export async function revealLocalPath(path: string): Promise<void> {
  if (isE2eBrowserMode()) return;
  await invoke("reveal_local_path", { path });
}
