import type { SavedConnection, TabSession } from "../types";
import { inferOsIdFromName } from "./osLogos";

export interface SessionOsDisplay {
  osId: string | null;
  osName: string | null;
}

type SessionOsSource = Pick<
  TabSession,
  "kind" | "os_id" | "os_name" | "title" | "server_id"
>;

function savedServerId(saved: SavedConnection): string {
  return `${saved.username}@${saved.host}:${saved.port}`;
}

function findSavedOs(
  tab: SessionOsSource,
  savedConnections: readonly SavedConnection[],
): SessionOsDisplay | null {
  const byName = savedConnections.find((item) => item.name === tab.title);
  if (byName?.os_id) {
    return { osId: byName.os_id, osName: byName.os_name ?? null };
  }

  if (tab.server_id) {
    const byServer = savedConnections.find(
      (item) => savedServerId(item) === tab.server_id,
    );
    if (byServer?.os_id) {
      return { osId: byServer.os_id, osName: byServer.os_name ?? null };
    }
  }

  return null;
}

/** Single source of truth for session OS icon across tabs, bookmarks fallback, and panels. */
export function resolveSessionOsProfile(
  tab: SessionOsSource | null | undefined,
  savedConnections: readonly SavedConnection[],
  osNameHint?: string | null,
): SessionOsDisplay {
  if (!tab) {
    const inferred = inferOsIdFromName(osNameHint);
    return inferred
      ? { osId: inferred, osName: osNameHint ?? null }
      : { osId: null, osName: osNameHint ?? null };
  }

  if (tab.os_id) {
    return { osId: tab.os_id, osName: tab.os_name ?? osNameHint ?? null };
  }

  const fromSaved = findSavedOs(tab, savedConnections);
  if (fromSaved) return fromSaved;

  const inferred =
    inferOsIdFromName(tab.os_name) ?? inferOsIdFromName(osNameHint);
  if (inferred) {
    return {
      osId: inferred,
      osName: tab.os_name ?? osNameHint ?? null,
    };
  }

  return { osId: null, osName: tab.os_name ?? osNameHint ?? null };
}
