/** Chat media helpers — prefer sidecar (no Rust rebuild required for display). */

import { invoke } from "@tauri-apps/api/core";
import { ensureSidecar, sidecarFetch } from "./api";
import { isHttpUrl } from "./openExternalUrl";

export type CachedRemoteMedia = {
  media_id: string;
  path: string;
  content_type: string;
  bytes: number;
  /** Prefer over convertFileSrc — survives markdown innerHTML round-trip. */
  data_url: string;
};

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp)(?:$|[?#])/i;

export function looksLikeImageUrl(url: string): boolean {
  const trimmed = (url || "").trim();
  if (!trimmed) return false;
  if (IMAGE_EXT_RE.test(trimmed)) return true;
  try {
    const u = new URL(trimmed);
    return IMAGE_EXT_RE.test(u.pathname);
  } catch {
    return false;
  }
}

function pickDataUrl(raw: Record<string, unknown>): string {
  const a = raw.data_url;
  const b = raw.dataUrl;
  if (typeof a === "string" && a.startsWith("data:")) return a;
  if (typeof b === "string" && b.startsWith("data:")) return b;
  return "";
}

function normalizeCached(raw: Record<string, unknown>): CachedRemoteMedia {
  const data_url = pickDataUrl(raw);
  if (!data_url) throw new Error("media_missing_data_url");
  const media_id = String(raw.media_id ?? raw.mediaId ?? "");
  const path = String(raw.path ?? raw.cached_path ?? raw.cachedPath ?? "");
  const content_type = String(
    raw.content_type ?? raw.contentType ?? "application/octet-stream",
  );
  const bytes = Number(raw.bytes ?? 0);
  return { media_id, path, content_type, bytes, data_url };
}

/** Prefer data_url; never use a bare filesystem path as <img src>. */
export function mediaDisplaySrc(cached: CachedRemoteMedia): string {
  if (cached.data_url?.startsWith("data:")) return cached.data_url;
  throw new Error("media_missing_data_url");
}

export async function cacheRemoteMedia(url: string): Promise<CachedRemoteMedia> {
  const trimmed = (url || "").trim();
  if (!isHttpUrl(trimmed)) {
    throw new Error("media_url_not_http");
  }
  // Sidecar path — works as soon as Python reloads (no cargo rebuild).
  try {
    const sidecar = await ensureSidecar();
    const res = await sidecarFetch(sidecar, "/v1/media/fetch", {
      method: "POST",
      body: JSON.stringify({ url: trimmed }),
    });
    if (res.ok) {
      const raw = (await res.json()) as Record<string, unknown>;
      return normalizeCached(raw);
    }
  } catch {
    // fall through to Rust
  }
  const raw = await invoke<Record<string, unknown>>("ai_chat_cache_remote_media", {
    url: trimmed,
  });
  return normalizeCached(raw);
}

const MEDIA_REF_RE = /^media:([a-fA-F0-9]{16,128})$/;

export function parseMediaRef(src: string): string | null {
  const m = MEDIA_REF_RE.exec((src || "").trim());
  return m ? m[1] : null;
}

export async function resolveMediaId(mediaId: string): Promise<CachedRemoteMedia> {
  const id = (mediaId || "").trim();
  if (!id) throw new Error("media_id_empty");
  try {
    const sidecar = await ensureSidecar();
    const res = await sidecarFetch(
      sidecar,
      `/v1/media/${encodeURIComponent(id)}`,
    );
    if (res.ok) {
      const raw = (await res.json()) as Record<string, unknown>;
      return normalizeCached(raw);
    }
  } catch {
    // fall through
  }
  const raw = await invoke<Record<string, unknown>>("ai_chat_resolve_media", {
    media_id: id,
  });
  return normalizeCached(raw);
}
