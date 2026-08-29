/** Attach context to AI chat from terminal/FS without importing the panel. */

import i18n from "../../i18n";
import { useAiEngineerStore } from "../../stores/aiEngineerStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useToastStore } from "../../stores/toastStore";
import { formatAppError } from "../formatAppError";
import { aiTerminalExec } from "./api";
import {
  buildRemoteHeadCommand,
  nextAttachmentId,
  resolveRemotePathForAttach,
  type PendingAttachment,
} from "./attachments";

const TEXT_EXTS = new Set([
  ".txt",
  ".log",
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".conf",
  ".csv",
  ".sh",
  ".bash",
  ".zsh",
  ".py",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".rs",
  ".go",
  ".mod",
  ".sum",
  ".toml",
  ".ini",
  ".env",
  ".xml",
  ".html",
  ".css",
  ".sql",
  ".lock",
  ".gitignore",
  ".dockerignore",
  ".editorconfig",
]);

/** Extensionless / special basenames treated as text for Send to chat. */
const TEXT_BASENAMES = new Set([
  "dockerfile",
  "makefile",
  "gnumakefile",
  "gemfile",
  "rakefile",
  "procfile",
  "vagrantfile",
  "license",
  "licence",
  "readme",
  "changelog",
  "authors",
  "copying",
  "go.mod",
  "go.sum",
  "cargo.toml",
  "cargo.lock",
  "package.json",
  "tsconfig.json",
  "Jenkinsfile",
].map((s) => s.toLowerCase()));
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
/** Max remote/local image bytes allowed into chat. */
export const MAX_CHAT_IMAGE_BYTES = 2 * 1024 * 1024;

function extOf(path: string): string {
  const base = path.split("/").pop() || path;
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i).toLowerCase() : "";
}

export function classifyRemotePathForChat(
  path: string,
): "text" | "image" | "reject" {
  const base = (path.split("/").pop() || path).toLowerCase();
  const ext = extOf(path);
  if (TEXT_BASENAMES.has(base) || TEXT_EXTS.has(ext)) return "text";
  if (IMAGE_EXTS.has(ext)) return "image";
  // Dockerfile.prod / Makefile.am etc.
  if (base.startsWith("dockerfile") || base.startsWith("makefile")) return "text";
  return "reject";
}

/** Whether context menus should offer Send to chat for this path. */
export function canSendPathToChat(
  path: string,
  sizeBytes?: number | null,
): boolean {
  const kind = classifyRemotePathForChat(path);
  if (kind === "reject") return false;
  if (
    kind === "image" &&
    sizeBytes != null &&
    Number.isFinite(sizeBytes) &&
    sizeBytes > MAX_CHAT_IMAGE_BYTES
  ) {
    return false;
  }
  return true;
}

function basename(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || path;
}

function mediaTypeFor(path: string): string {
  const ext = extOf(path);
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

export function openChatComposer(sessionId: string, serverId?: string): void {
  const store = useAiEngineerStore.getState();
  // Missing serverId must not switch away from an active server-scoped thread
  // (that resets the UI to an empty "New chat").
  let resolved = (serverId ?? "").trim() || undefined;
  if (!resolved && store.sessionId === sessionId && store.serverId) {
    resolved = store.serverId;
  }
  if (!resolved) {
    const tab = useSessionStore
      .getState()
      .tabs.find((item) => item.id === sessionId);
    const fromTab = (tab?.server_id ?? "").trim();
    if (fromTab) resolved = fromTab;
  }
  store.openPanel(sessionId, resolved);
  store.requestComposerFocus();
}

export function attachPendingAndFocus(att: PendingAttachment): void {
  const store = useAiEngineerStore.getState();
  store.addPendingAttachment(att);
  store.requestComposerFocus();
}

export function sendConsoleSelectionToChat(
  sessionId: string,
  text: string,
  serverId?: string,
): void {
  const trimmed = text.replace(/\x00/g, "").trim();
  if (!trimmed) {
    useToastStore
      .getState()
      .pushToast(i18n.t("tools:aiEngineer.attachNoSelection"), false);
    return;
  }
  const store = useAiEngineerStore.getState();
  if (store.busy) {
    openChatComposer(sessionId, serverId);
    void store.flushMidRunContext(trimmed).then((ok) => {
      useToastStore.getState().pushToast(
        ok
          ? i18n.t("tools:aiEngineer.flushContextOk")
          : i18n.t("tools:aiEngineer.flushContextFailed"),
        ok,
      );
    });
    return;
  }
  openChatComposer(sessionId, serverId);
  attachPendingAndFocus({
    id: nextAttachmentId(),
    kind: "console",
    label: "selection",
    text: trimmed.slice(0, 64 * 1024),
  });
  useToastStore
    .getState()
    .pushToast(i18n.t("tools:aiEngineer.attachConsoleOk"), true);
}

export async function sendRemotePathToChat(
  sessionId: string,
  path: string,
  serverId?: string,
): Promise<void> {
  let p: string;
  try {
    const resolved = await resolveRemotePathForAttach(sessionId, path);
    if (!resolved) {
      useToastStore
        .getState()
        .pushToast(i18n.t("tools:aiEngineer.attachRemoteInvalid"), false);
      return;
    }
    p = resolved;
  } catch (err) {
    useToastStore.getState().pushToast(formatAppError(err), false);
    return;
  }
  const kind = classifyRemotePathForChat(p);
  if (kind === "reject") {
    useToastStore
      .getState()
      .pushToast(i18n.t("tools:aiEngineer.attachUnsupported"), false);
    return;
  }

  try {
    if (kind === "text") {
      const cmd = buildRemoteHeadCommand(p);
      if (!cmd) {
        useToastStore
          .getState()
          .pushToast(i18n.t("tools:aiEngineer.attachRemoteInvalid"), false);
        return;
      }
      const result = await aiTerminalExec({ sessionId, command: cmd });
      const text = `${result.stdout || ""}${result.stderr || ""}`.slice(
        0,
        64 * 1024,
      );
      if (!text.trim()) {
        useToastStore
          .getState()
          .pushToast(i18n.t("tools:aiEngineer.attachRemoteEmpty"), false);
        return;
      }
      // Archives / binaries misnamed as .log/.txt often contain NUL.
      if (text.includes("\0")) {
        useToastStore
          .getState()
          .pushToast(i18n.t("tools:aiEngineer.attachUnsupported"), false);
        return;
      }
      openChatComposer(sessionId, serverId);
      attachPendingAndFocus({
        id: nextAttachmentId(),
        kind: "remote_file",
        path: p,
        text,
      });
      useToastStore
        .getState()
        .pushToast(i18n.t("tools:aiEngineer.attachRemoteOk", { path: p }), true);
      return;
    }

    const quoted = JSON.stringify(p);
    const sizeCmd = `wc -c -- ${quoted} | awk '{print $1}'`;
    const sizeRes = await aiTerminalExec({ sessionId, command: sizeCmd });
    const size = Number.parseInt(String(sizeRes.stdout || "").trim(), 10);
    if (!Number.isFinite(size) || size <= 0) {
      useToastStore
        .getState()
        .pushToast(i18n.t("tools:aiEngineer.attachRemoteEmpty"), false);
      return;
    }
    if (size > MAX_CHAT_IMAGE_BYTES) {
      useToastStore
        .getState()
        .pushToast(i18n.t("tools:aiEngineer.attachTooLarge"), false);
      return;
    }
    const b64Cmd = `base64 < ${quoted} | tr -d '\\n'`;
    const b64Res = await aiTerminalExec({ sessionId, command: b64Cmd });
    const data_base64 = String(b64Res.stdout || "").trim();
    if (!data_base64) {
      useToastStore
        .getState()
        .pushToast(i18n.t("tools:aiEngineer.attachRemoteEmpty"), false);
      return;
    }
    const name = basename(p);
    openChatComposer(sessionId, serverId);
    attachPendingAndFocus({
      id: nextAttachmentId(),
      kind: "local_image",
      name,
      media_type: mediaTypeFor(p),
      data_base64,
    });
    useToastStore
      .getState()
      .pushToast(i18n.t("tools:aiEngineer.attachRemoteOk", { path: p }), true);
  } catch (err) {
    useToastStore.getState().pushToast(formatAppError(err), false);
  }
}
