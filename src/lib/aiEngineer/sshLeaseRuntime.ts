import { invoke } from "@tauri-apps/api/core";

const leased = new Set<string>();

type LeaseListener = (ids: Record<string, true>) => void;
const listeners = new Set<LeaseListener>();

function snapshot(): Record<string, true> {
  const out: Record<string, true> = {};
  for (const id of leased) out[id] = true;
  return out;
}

function publish(): void {
  const ids = snapshot();
  for (const listener of listeners) listener(ids);
}

/** Subscribe to lease map changes (for Zustand sync). */
export function subscribeAiSshLease(listener: LeaseListener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function isSessionAiSshLeased(sessionId: string): boolean {
  return Boolean(sessionId) && leased.has(sessionId);
}

export function leasedSessionIdsRecord(): Record<string, true> {
  return snapshot();
}

export async function acquireAiSshLease(sessionId: string): Promise<void> {
  const id = sessionId.trim();
  if (!id) return;
  leased.add(id);
  publish();
  try {
    await invoke("set_ai_ssh_lease", { sessionId: id, active: true });
  } catch {
    /* offline / mock */
  }
}

export async function releaseAiSshLease(
  sessionId: string | null | undefined,
): Promise<void> {
  const id = (sessionId ?? "").trim();
  if (!id) return;
  if (!leased.has(id)) return;
  leased.delete(id);
  publish();
  try {
    await invoke("set_ai_ssh_lease", { sessionId: id, active: false });
  } catch {
    /* offline / mock */
  }
}
