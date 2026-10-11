/** Guided local-CLI sign-in: sidecar starts login → TW opens browser → poll until ready. */

import {
  cancelRuntimeLogin,
  ensureSidecar,
  getRuntimeLoginStatus,
  probeRuntime,
  startRuntimeLogin,
  type AgentRuntimeKind,
  type RuntimeLoginResult,
  type RuntimeProbeResult,
} from "./api";
import { openExternalUrl } from "./openExternalUrl";
import { externalRuntimeStatusKind } from "./cursorRuntimeStatus";

export type GuidedLoginProgress = {
  phase: string;
  url: string;
  detail: string;
};

const LOGIN_FAILURE_CODE = /^login_[a-z0-9_]+$/i;

/** Hide raw sidecar codes. A thrown string is a transport failure. */
export function guidedLoginErrorDetail(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const msg = err.message.trim();
  if (
    !msg ||
    LOGIN_FAILURE_CODE.test(msg) ||
    msg.startsWith("{") ||
    msg.includes("Runtime login")
  ) {
    return fallback;
  }
  if (msg.length > 180) return fallback;
  return msg;
}

async function openLoginUrlIfNeeded(result: {
  url?: string;
  open_browser?: boolean;
}): Promise<void> {
  if (!result.url || result.open_browser === false) return;
  try {
    await openExternalUrl(result.url);
  } catch {
    // User can still copy/open from status; keep waiting.
  }
}

export async function runGuidedRuntimeLogin(
  kind: AgentRuntimeKind,
  opts?: {
    onProgress?: (p: GuidedLoginProgress) => void;
    signal?: AbortSignal;
    /** Max wait after browser open (ms). Default 3 minutes. */
    timeoutMs?: number;
  },
): Promise<RuntimeProbeResult> {
  if (kind === "builtin") {
    throw new Error("builtin_has_no_cli_login");
  }
  const info = await ensureSidecar();
  const started = await startRuntimeLogin(info, kind);
  opts?.onProgress?.({
    phase: started.phase,
    url: started.url,
    detail: started.detail,
  });

  if (started.url) {
    await openLoginUrlIfNeeded(started);
  }

  if (started.phase === "succeeded") {
    return probeRuntime(info, kind);
  }

  const deadline = Date.now() + (opts?.timeoutMs ?? 180_000);
  while (Date.now() < deadline) {
    if (opts?.signal?.aborted) {
      await cancelRuntimeLogin(info, kind).catch(() => undefined);
      throw new DOMException("Aborted", "AbortError");
    }
    const probe = await probeRuntime(info, kind);
    if (externalRuntimeStatusKind(probe, kind) === "ready") {
      await cancelRuntimeLogin(info, kind).catch(() => undefined);
      return probe;
    }
    let login: RuntimeLoginResult | null = null;
    try {
      login = await getRuntimeLoginStatus(info, kind);
      opts?.onProgress?.({
        phase: login.phase,
        url: login.url || started.url,
        detail: login.detail,
      });
      if (login.url && login.url !== started.url) {
        await openLoginUrlIfNeeded(login);
      }
      if (login.phase === "succeeded") {
        return probeRuntime(info, kind);
      }
      if (login.phase === "failed" || login.phase === "cancelled") {
        throw new Error(login.detail || `login_${login.phase}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("login_")) throw err;
      if (err instanceof Error && !err.message.includes("login status")) throw err;
    }
    await sleep(1500, opts?.signal);
  }
  await cancelRuntimeLogin(info, kind).catch(() => undefined);
  throw new Error("login_timeout");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
