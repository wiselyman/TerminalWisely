import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../isTauri";

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

export async function ensureSidecar(): Promise<SidecarInfo> {
  return invoke<SidecarInfo>("ensure_ai_sidecar");
}

export async function getAiSettings(): Promise<AiSettingsView> {
  return invoke<AiSettingsView>("get_ai_settings");
}

export async function saveAiSettings(
  update: AiSettingsUpdate,
): Promise<AiSettingsView> {
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
  _info: SidecarInfo,
  path: string,
  init?: RequestInit,
): Promise<Response> {
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
