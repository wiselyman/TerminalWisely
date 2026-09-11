/** Bridge so AI panel can read the active xterm selection without a second SSH. */

import { useAiEngineerStore } from "../../stores/aiEngineerStore";
import { useSessionStore } from "../../stores/sessionStore";

type SelectionProvider = () => string;

/** Per-session providers — all TerminalViews stay mounted; a single global
 *  provider was overwritten by whichever tab mounted last (empty selection). */
const providers = new Map<string, SelectionProvider>();

export function registerTerminalSelectionProvider(
  sessionId: string,
  fn: SelectionProvider | null,
): void {
  const id = (sessionId || "").trim();
  if (!id) return;
  if (fn) providers.set(id, fn);
  else providers.delete(id);
}

function readFrom(fn: SelectionProvider | undefined): string {
  if (!fn) return "";
  try {
    return (fn() ?? "").replace(/\x00/g, "");
  } catch {
    return "";
  }
}

export function readActiveTerminalSelection(): string {
  const aiSession = (useAiEngineerStore.getState().sessionId || "").trim();
  const activeTab = (useSessionStore.getState().activeTabId || "").trim();
  for (const id of [aiSession, activeTab]) {
    if (!id) continue;
    const text = readFrom(providers.get(id));
    if (text.trim()) return text;
  }
  // Fallback: any tab that still has a cached selection.
  for (const fn of providers.values()) {
    const text = readFrom(fn);
    if (text.trim()) return text;
  }
  return "";
}
