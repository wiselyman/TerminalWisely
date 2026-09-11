/** Deliver host tool results to the sidecar (must not fail silently). */

import type { SidecarInfo } from "./api";
import { sidecarFetch } from "./api";

export type ToolResultBody = {
  session_id: string;
  run_id: string;
  call_id: string;
  ok: boolean;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  error: string | null;
};

/**
 * POST /v1/tool_result with retries. 409 means the wait already settled
 * (timeout/cancel) — treat as success. Other failures throw after retries.
 */
export async function postToolResultWithRetry(
  sidecar: SidecarInfo,
  body: ToolResultBody,
  opts?: { attempts?: number; sleepMs?: (n: number) => Promise<void> },
): Promise<"delivered" | "already_settled"> {
  const attempts = opts?.attempts ?? 3;
  const sleep =
    opts?.sleepMs ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await sidecarFetch(sidecar, "/v1/tool_result", {
        method: "POST",
        body: JSON.stringify({ ...body, untrusted: true }),
      });
      if (res.ok) return "delivered";
      if (res.status === 409) return "already_settled";
      const text = await res.text().catch(() => "");
      lastErr = new Error(`tool_result HTTP ${res.status}: ${text.slice(0, 200)}`);
    } catch (err) {
      lastErr = err;
    }
    if (i + 1 < attempts) await sleep(200 * (i + 1));
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`tool_result failed: ${String(lastErr)}`);
}
