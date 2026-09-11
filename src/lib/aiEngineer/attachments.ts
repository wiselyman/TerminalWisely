/** Local/remote attachment helpers for AI Engineer composer. */

import { joinRemotePath, readTerminalPromptCwd } from "../terminalContext";
import { getTerminalSession } from "../terminalSelectionDrag";
import { aiTerminalExec } from "./api";

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
  ".toml",
  ".ini",
  ".env",
  ".xml",
  ".html",
  ".css",
  ".sql",
]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const REJECT_OFFICE = new Set([
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".pdf",
]);

const LOCAL_TEXT_MAX = 256 * 1024;
const LOCAL_IMAGE_MAX = 2 * 1024 * 1024;
const REMOTE_READ_MAX = 64 * 1024;

export type PendingAttachment =
  | { id: string; kind: "console"; label?: string; text: string }
  | { id: string; kind: "remote_file"; path: string; text: string }
  | { id: string; kind: "local_text"; name: string; text: string }
  | {
      id: string;
      kind: "local_image";
      name: string;
      media_type: string;
      data_base64: string;
    };

export type AttachmentWire = {
  kind: PendingAttachment["kind"];
  label?: string;
  path?: string;
  name?: string;
  text?: string;
  media_type?: string;
  data_base64?: string;
};

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function nextAttachmentId(): string {
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function toWireAttachments(list: PendingAttachment[]): AttachmentWire[] {
  return list.map((a) => {
    if (a.kind === "console") {
      return { kind: "console", label: a.label, text: a.text };
    }
    if (a.kind === "remote_file") {
      return { kind: "remote_file", path: a.path, text: a.text };
    }
    if (a.kind === "local_text") {
      return { kind: "local_text", name: a.name, text: a.text };
    }
    return {
      kind: "local_image",
      name: a.name,
      media_type: a.media_type,
      data_base64: a.data_base64,
    };
  });
}

export function classifyLocalFile(file: File): "text" | "image" | "reject" {
  const ext = extOf(file.name);
  if (TEXT_EXTS.has(ext)) return "text";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (REJECT_OFFICE.has(ext)) return "reject";
  // Clipboard paste often has type but a generic/empty name.
  const mt = (file.type || "").toLowerCase();
  if (
    mt === "image/png" ||
    mt === "image/jpeg" ||
    mt === "image/jpg" ||
    mt === "image/webp"
  ) {
    return "image";
  }
  if (
    mt === "application/pdf" ||
    mt.includes("officedocument") ||
    mt.includes("msword") ||
    mt.includes("ms-excel") ||
    mt.includes("ms-powerpoint")
  ) {
    return "reject";
  }
  return "reject";
}

export async function readLocalTextFile(file: File): Promise<string> {
  if (file.size > LOCAL_TEXT_MAX) {
    throw new Error("local_text_too_large");
  }
  const text = await file.text();
  return text.replace(/\x00/g, "");
}

async function fileToBase64(file: File, maxBytes: number): Promise<string> {
  if (file.size > maxBytes) {
    throw new Error("local_file_too_large");
  }
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function readLocalImageBase64(
  file: File,
): Promise<{ media_type: string; data_base64: string }> {
  if (file.size > LOCAL_IMAGE_MAX) {
    throw new Error("local_image_too_large");
  }
  const data_base64 = await fileToBase64(file, LOCAL_IMAGE_MAX);
  return {
    media_type: file.type || "application/octet-stream",
    data_base64,
  };
}

/**
 * Absolute remote path safe to pass as a shell argument (always quoted).
 * Allows Unicode (e.g. Chinese filenames); rejects relative paths, `..`
 * segments, and control characters.
 */
export function isSafeRemotePath(path: string): boolean {
  const p = path.trim();
  if (!p.startsWith("/")) return false;
  if (p.includes("\0") || /[\u0000-\u001f\u007f]/.test(p)) return false;
  if (p.split("/").includes("..")) return false;
  return true;
}

/**
 * Turn a terminal-relative / ~/ path into an absolute path safe for attach.
 * Uses prompt cwd when available, then expands ~ via remote $HOME.
 */
export async function resolveRemotePathForAttach(
  sessionId: string,
  path: string,
  cwdHint?: string | null,
): Promise<string | null> {
  let p = path.trim().replace(/[$#]+$/, "");
  if (!p || p.includes("\0") || p.includes("..")) return null;

  let cwd = (cwdHint || "").trim();
  if (!cwd) {
    const term = getTerminalSession(sessionId);
    if (term) {
      cwd = (readTerminalPromptCwd(term) || "").trim();
    }
  }

  if (!p.startsWith("/") && p !== "~" && !p.startsWith("~/")) {
    if (!cwd) return null;
    p = joinRemotePath(cwd, p);
  }

  if (p === "~" || p.startsWith("~/")) {
    const homeRes = await aiTerminalExec({
      sessionId,
      command: "printf '%s' \"$HOME\"",
    });
    const home = String(homeRes.stdout || "").trim();
    if (!home.startsWith("/")) return null;
    p = p === "~" ? home : `${home.replace(/\/$/, "")}${p.slice(1)}`;
  }

  p = p.replace(/\/{2,}/g, "/");
  if (!isSafeRemotePath(p)) return null;
  return p;
}

export function buildRemoteHeadCommand(path: string): string | null {
  if (!isSafeRemotePath(path)) return null;
  // JSON.stringify → POSIX-safe single shell word (Unicode OK).
  return `head -c ${REMOTE_READ_MAX} -- ${JSON.stringify(path)}`;
}

export const WORKFLOW_CHIP_IDS = [
  "ports",
  "systemd",
  "disk",
  "nginx502",
] as const;

export const K8S_WORKFLOW_CHIP_IDS = [
  "podIssues",
  "crashLoop",
  "deployStatus",
  "recentEvents",
] as const;

export type WorkflowChipId = (typeof WORKFLOW_CHIP_IDS)[number];
export type K8sWorkflowChipId = (typeof K8S_WORKFLOW_CHIP_IDS)[number];

/** English prompts; FE maps via i18n keys for display labels. */
export function workflowPrompt(
  id: WorkflowChipId,
  interactionMode: "ask" | "plan" | "agent",
): string {
  const ask = interactionMode === "ask";
  const plan = interactionMode === "plan";
  switch (id) {
    case "ports":
      if (ask) return "Who is listening on the important TCP ports? Inspect only; explain findings.";
      if (plan) return "Plan how to identify what listens on key ports (update_plan). Do not mutate.";
      return "Check which processes listen on key TCP ports and summarize.";
    case "systemd":
      if (ask) return "Investigate failed or inactive systemd services. Read-only; explain.";
      if (plan) return "Plan steps to diagnose systemd service failures (update_plan). No mutations.";
      return "Find failed systemd units and diagnose the top issue.";
    case "disk":
      if (ask) return "Check disk usage on mounts. Read-only; explain what is full.";
      if (plan) return "Plan how to investigate disk space pressure (update_plan). No mutations.";
      return "Check disk usage and identify what is consuming space.";
    case "nginx502":
      if (ask) return "Investigate a possible nginx 502. Read configs/logs only; explain.";
      if (plan) return "Plan diagnosis for nginx 502 (update_plan). Do not restart services yet.";
      return "Diagnose nginx 502: check listeners, upstream, and recent error logs.";
  }
}

export function k8sWorkflowPrompt(
  id: K8sWorkflowChipId,
  interactionMode: "ask" | "plan" | "agent",
): string {
  const ask = interactionMode === "ask";
  const plan = interactionMode === "plan";
  switch (id) {
    case "podIssues":
      if (ask) return "Summarize non-Running pods in the current namespace. Read-only; explain.";
      if (plan) return "Plan how to triage unhealthy pods with k8s_list/k8s_describe (update_plan). No mutations.";
      return "List pods, find unhealthy ones, and diagnose the worst issue with describe/logs.";
    case "crashLoop":
      if (ask) return "Is any pod CrashLoopBackOff or ImagePullBackOff? Explain using describe/logs only.";
      if (plan) return "Plan CrashLoop/ImagePull diagnosis with k8s_* tools (update_plan). No mutations.";
      return "Find CrashLoopBackOff or ImagePullBackOff pods and diagnose root cause from events/logs.";
    case "deployStatus":
      if (ask) return "Are Deployments Available and Ready? Explain readiness without mutating.";
      if (plan) return "Plan how to verify Deployment readiness (update_plan). No scale/apply yet.";
      return "Check Deployments Ready/Available status and explain any gaps.";
    case "recentEvents":
      if (ask) return "What Warning events happened recently? Summarize from k8s_list events.";
      if (plan) return "Plan how to review Warning events and linked objects (update_plan).";
      return "List recent Warning events and investigate the most severe one.";
  }
}
