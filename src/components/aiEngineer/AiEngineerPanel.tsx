import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { riskDescKey, riskLabelKey } from "../../lib/aiEngineer/riskLabels";
import {
  normalizeInteractionMode,
  normalizeSecurityMode,
  useAiEngineerStore,
} from "../../stores/aiEngineerStore";
import { AiEngineerSettings } from "./AiEngineerSettings";
import { SecurityModePicker } from "./SecurityModePicker";
import { InteractionModePicker } from "./InteractionModePicker";
import { AiMarkdown } from "./AiMarkdown";
import { WorkspacePanelBackdrop } from "../WorkspacePanelBackdrop";
import { useWorkspacePanelEnter } from "../../lib/useWorkspacePanelEnter";
import {
  ChatHistoryIcon,
  NewChatIcon,
} from "../WorkspaceToolIcons";
import { WorkspacePanelHeadActions } from "../WorkspacePanelHeadActions";
import {
  extractCommandTitle,
  sanitizeDisplayCommand,
} from "../../lib/aiEngineer/commandDisplay";
import {
  formatActiveAiProfileLabel,
  isAiModelConfigured,
} from "../../lib/aiEngineerSettings";
import {
  highlightShell,
  summarizeShellTools,
} from "../../lib/aiEngineer/shellHighlight";
import {
  WORKFLOW_CHIP_IDS,
  classifyLocalFile,
  nextAttachmentId,
  readLocalImageBase64,
  readLocalTextFile,
  type PendingAttachment,
  workflowPrompt,
  type WorkflowChipId,
} from "../../lib/aiEngineer/attachments";
import { sendRemotePathToChat } from "../../lib/aiEngineer/sendToChat";
import { readActiveTerminalSelection } from "../../lib/aiEngineer/terminalSelectionBridge";
import { useToastStore } from "../../stores/toastStore";
import { formatAppError } from "../../lib/formatAppError";
import { FileText, TerminalSquare } from "lucide-react";

type Props = {
  sessionId: string;
  serverId?: string;
};

type AttachmentPreview = {
  title: string;
  kind: "text" | "image";
  text?: string;
  mediaUrl?: string;
};

/** Composer / history tile glyph — text docs must read as documents, not paths. */
function AttachTileGlyph({
  kind,
}: {
  kind: string | undefined;
}) {
  if (kind === "console") {
    return <TerminalSquare size={22} strokeWidth={1.6} aria-hidden />;
  }
  if (kind === "local_image") {
    return <span aria-hidden>IMG</span>;
  }
  // remote_file + local_text (+ unknown text-like)
  return <FileText size={22} strokeWidth={1.6} aria-hidden />;
}

function scrollMessagesToEnd(el: HTMLElement) {
  // Prefer last-child geometry — more reliable than scrollHeight alone in flex layouts.
  const last = el.lastElementChild as HTMLElement | null;
  if (last) {
    el.scrollTop = Math.max(0, last.offsetTop + last.offsetHeight - el.clientHeight + 8);
  } else {
    el.scrollTop = el.scrollHeight;
  }
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  return `${min}m ${totalSec % 60}s`;
}

type ToolLine = Extract<
  import("../../stores/aiEngineerStore").ChatLine,
  { kind: "tool" }
>;

function TerminalGlyph({
  mode,
}: {
  mode: "prompt" | "expand" | "collapse";
}) {
  if (mode === "collapse") {
    return (
      <svg
        className="ai-engineer-exec-glyph-svg"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden
      >
        <path
          d="M2.5 4L6 7.5L9.5 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (mode === "expand") {
    return (
      <svg
        className="ai-engineer-exec-glyph-svg"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden
      >
        <path
          d="M4 2.5L7.5 6L4 9.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  // Terminal prompt >_  (图1)
  return (
    <svg
      className="ai-engineer-exec-glyph-svg"
      width="14"
      height="12"
      viewBox="0 0 14 12"
      fill="none"
      aria-hidden
    >
      <path
        d="M1.5 2L5.2 6L1.5 10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 10H12.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ToolExecCard({
  line,
  t,
}: {
  line: ToolLine;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const outputRef = useRef<HTMLPreElement>(null);
  const [, tick] = useState(0);
  const [hovered, setHovered] = useState(false);
  const running = line.status === "running";
  const isExec = line.name === "terminal_exec" || line.name === "ai_exec";
  // Open while running so the user can watch output; collapse when finished for a cleaner transcript.
  const [expanded, setExpanded] = useState(() => running);

  useEffect(() => {
    setExpanded(running);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [line.output, running, expanded]);

  if (!isExec) {
    const label =
      line.name === "spawn_investigator"
        ? t("aiEngineer.toolSpawnInvestigator")
        : line.name === "update_plan"
          ? t("aiEngineer.toolUpdatePlan")
          : line.name;
    return (
      <details className="ai-engineer-tool-row" open>
        <summary>
          <span className="ai-engineer-tool-name">{label}</span>
          {line.ok === false ? (
            <span className="ai-engineer-tool-fail">denied</span>
          ) : null}
        </summary>
        {line.detail ? (
          <code className="ai-engineer-tool-detail">{line.detail}</code>
        ) : null}
      </details>
    );
  }

  const elapsedMs =
    (running ? Date.now() : (line.finishedAt ?? Date.now())) -
    (line.startedAt ?? Date.now());

  const displayCommand = sanitizeDisplayCommand(line.detail || "");
  const title = (
    line.intent ||
    extractCommandTitle(line.detail || "") ||
    displayCommand.split("\n")[0] ||
    line.name
  ).trim();
  const toolChips = summarizeShellTools(displayCommand);
  const toolsLabel =
    toolChips.length > 0
      ? `${toolChips.slice(0, 5).join(", ")}${toolChips.length > 5 ? " …" : ""}`
      : "";
  const hasOutput = Boolean(line.output) || running;

  const copyCommand = (e: ReactMouseEvent) => {
    e.stopPropagation();
    const text = displayCommand || line.detail || "";
    if (!text) return;
    void import("../../lib/clipboard")
      .then(({ copyToClipboard }) => copyToClipboard(text))
      .catch(() => undefined);
  };

  // 图1 >_ · 图3 hover > · 图2 expanded ∨
  const glyphMode = expanded ? "collapse" : hovered ? "expand" : "prompt";

  return (
    <div
      className={`ai-engineer-exec-card${expanded ? " is-expanded" : " is-collapsed"}${hovered ? " is-hovered" : ""}`}
      data-ai-exec="1"
      data-ai-exec-status={line.status ?? "idle"}
      style={{ flexShrink: 0, minHeight: 28, overflow: "visible" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="ai-engineer-exec-head"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={
          expanded
            ? t("aiEngineer.toolCollapse", { title })
            : t("aiEngineer.toolExpand", { title })
        }
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
      >
        <span className="ai-engineer-exec-glyph" aria-hidden>
          <TerminalGlyph mode={glyphMode} />
        </span>
        <span className="ai-engineer-exec-title" title={title}>
          {title}
        </span>
        {toolsLabel ? (
          <span className="ai-engineer-exec-tools" aria-hidden>
            {toolsLabel}
          </span>
        ) : null}
        {expanded ? (
          <button
            type="button"
            className="ai-engineer-exec-more"
            aria-label={t("aiEngineer.toolCopyCommand")}
            title={t("aiEngineer.toolCopyCommand")}
            onClick={copyCommand}
          >
            ···
          </button>
        ) : null}
      </div>
      {expanded ? (
        <div className="ai-engineer-exec-body">
          {displayCommand ? (
            <div className="ai-engineer-exec-command">
              <span className="ai-engineer-exec-prompt" aria-hidden>
                $
              </span>
              <code className="ai-engineer-exec-command-code">
                {highlightShell(displayCommand)}
              </code>
            </div>
          ) : null}
          {hasOutput ? (
            <pre ref={outputRef} className="ai-engineer-exec-output">
              {line.output ||
                (running ? t("aiEngineer.toolWaitingOutput") : "")}
            </pre>
          ) : null}
          {(line.status === "done" ||
            line.status === "failed" ||
            running) && (
            <div className="ai-engineer-exec-foot">
              {line.exitCode != null ? (
                <span>
                  {t("aiEngineer.toolExitCode", { code: line.exitCode })}
                </span>
              ) : null}
              <span>
                {t("aiEngineer.toolElapsed", {
                  time: formatElapsed(elapsedMs),
                })}
              </span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function AiEngineerPanel({ sessionId, serverId }: Props) {
  const { t } = useTranslation("tools");
  const open = useAiEngineerStore((s) => s.open);
  const width = useAiEngineerStore((s) => s.width);
  const setWidth = useAiEngineerStore((s) => s.setWidth);
  const ready = useAiEngineerStore((s) => s.ready);
  const starting = useAiEngineerStore((s) => s.starting);
  const bootstrapStatus = useAiEngineerStore((s) => s.bootstrapStatus);
  const bootstrapPhase = useAiEngineerStore((s) => s.bootstrapPhase);
  const bootstrapProgress = useAiEngineerStore((s) => s.bootstrapProgress);
  const bootstrapping =
    !ready && (starting || bootstrapPhase != null);
  const error = useAiEngineerStore((s) => s.error);
  const busy = useAiEngineerStore((s) => s.busy);
  const modelPhase = useAiEngineerStore((s) => s.modelPhase);
  const input = useAiEngineerStore((s) => s.input);
  const setInput = useAiEngineerStore((s) => s.setInput);
  const messages = useAiEngineerStore((s) => s.messages);
  const sendMessage = useAiEngineerStore((s) => s.sendMessage);
  const stopActiveRun = useAiEngineerStore((s) => s.stopActiveRun);
  const ensureReady = useAiEngineerStore((s) => s.ensureReady);
  const bindContext = useAiEngineerStore((s) => s.bindContext);
  const bindK8sContext = useAiEngineerStore((s) => s.bindK8sContext);
  const engineerMode = useAiEngineerStore((s) => s.engineerMode);
  const clusterId = useAiEngineerStore((s) => s.clusterId);
  const clusterName = useAiEngineerStore((s) => s.clusterName);
  const clusterTarget = useAiEngineerStore((s) => s.clusterTarget);
  const settingsOpen = useAiEngineerStore((s) => s.settingsOpen);
  const setSettingsOpen = useAiEngineerStore((s) => s.setSettingsOpen);
  const settings = useAiEngineerStore((s) => s.settings);
  const saveSettings = useAiEngineerStore((s) => s.saveSettings);
  const chatScope = useAiEngineerStore((s) => s.chatScope);
  const activeThreadId = useAiEngineerStore((s) => s.activeThreadId);
  const threadsByScope = useAiEngineerStore((s) => s.threadsByScope);
  const createThread = useAiEngineerStore((s) => s.createThread);
  const switchThread = useAiEngineerStore((s) => s.switchThread);
  const deleteThread = useAiEngineerStore((s) => s.deleteThread);
  const setThreadSecurityMode = useAiEngineerStore((s) => s.setThreadSecurityMode);
  const pendingAsk = useAiEngineerStore((s) => s.pendingAsk);
  const resolveAsk = useAiEngineerStore((s) => s.resolveAsk);
  const pendingApproval = useAiEngineerStore((s) => s.pendingApproval);
  const resolveApproval = useAiEngineerStore((s) => s.resolveApproval);
  const activePlan = useAiEngineerStore((s) => s.activePlan);
  const activeInvestigation = useAiEngineerStore((s) => s.activeInvestigation);
  const setThreadInteractionMode = useAiEngineerStore((s) => s.setThreadInteractionMode);
  const pendingAttachments = useAiEngineerStore((s) => s.pendingAttachments);
  const addPendingAttachment = useAiEngineerStore((s) => s.addPendingAttachment);
  const removePendingAttachment = useAiEngineerStore((s) => s.removePendingAttachment);
  const composerFocusNonce = useAiEngineerStore((s) => s.composerFocusNonce);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const [confirmDraft, setConfirmDraft] = useState("");
  const [askDraft, setAskDraft] = useState("");
  const [rememberRead, setRememberRead] = useState(false);
  const [approveForSession, setApproveForSession] = useState(false);
  const [approvePermanently, setApprovePermanently] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [attachMenuPos, setAttachMenuPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [attachmentPreview, setAttachmentPreview] =
    useState<AttachmentPreview | null>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const attachTriggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useWorkspacePanelEnter<HTMLElement>();

  useEffect(() => {
    if (!attachmentPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAttachmentPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attachmentPreview]);

  const openPendingPreview = (a: PendingAttachment) => {
    if (a.kind === "local_image") {
      setAttachmentPreview({
        title: a.name,
        kind: "image",
        mediaUrl: `data:${a.media_type};base64,${a.data_base64}`,
      });
      return;
    }
    const title =
      a.kind === "console"
        ? a.label || t("aiEngineer.attachKind.console")
        : a.kind === "remote_file"
          ? a.path
          : a.name;
    setAttachmentPreview({ title, kind: "text", text: a.text });
  };

  const threads = useMemo(() => {
    const list = chatScope ? threadsByScope[chatScope]?.threads ?? [] : [];
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [chatScope, threadsByScope]);

  const threadTitle =
    threads.find((th) => th.id === activeThreadId)?.title ||
    t("aiEngineer.newChat");
  const threadSecurityMode = normalizeSecurityMode(
    threads.find((th) => th.id === activeThreadId)?.securityMode,
  );
  const threadInteractionMode = normalizeInteractionMode(
    threads.find((th) => th.id === activeThreadId)?.interactionMode,
  );

  const pushToast = useToastStore((s) => s.pushToast);

  const addConsoleFromTerminal = () => {
    const sel = readActiveTerminalSelection().trim();
    if (!sel) {
      pushToast(t("aiEngineer.attachNoSelection"), false);
      return;
    }
    addPendingAttachment({
      id: nextAttachmentId(),
      kind: "console",
      label: "selection",
      text: sel.slice(0, 64 * 1024),
    });
  };

  const addRemotePath = async () => {
    const path = window.prompt(t("aiEngineer.attachRemotePrompt"));
    if (!path?.trim()) return;
    await sendRemotePathToChat(sessionId, path.trim(), serverId);
  };

  const onLocalFiles = async (files: FileList | File[] | null) => {
    if (!files || (Array.isArray(files) ? files.length === 0 : files.length === 0))
      return;
    const list = Array.isArray(files) ? files : Array.from(files);
    for (const file of list) {
      const kind = classifyLocalFile(file);
      if (kind === "reject") {
        pushToast(t("aiEngineer.attachUnsupported"), false);
        continue;
      }
      try {
        if (kind === "text") {
          const text = await readLocalTextFile(file);
          addPendingAttachment({
            id: nextAttachmentId(),
            kind: "local_text",
            name: file.name,
            text,
          });
        } else {
          const img = await readLocalImageBase64(file);
          addPendingAttachment({
            id: nextAttachmentId(),
            kind: "local_image",
            name: file.name || `paste-${Date.now()}.png`,
            media_type: img.media_type,
            data_base64: img.data_base64,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg === "local_text_too_large" ||
          msg === "local_image_too_large" ||
          msg === "local_file_too_large"
        ) {
          pushToast(t("aiEngineer.attachTooLarge"), false);
        } else {
          pushToast(formatAppError(err), false);
        }
      }
    }
  };

  const onComposerPaste = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items?.length) return;
    const images: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          const named =
            file.name && file.name !== "image.png"
              ? file
              : new File(
                  [file],
                  `screenshot-${Date.now()}.${item.type.split("/")[1] || "png"}`,
                  { type: item.type },
                );
          images.push(named);
        }
      }
    }
    if (images.length === 0) return;
    e.preventDefault();
    void onLocalFiles(images);
  };

  const applyWorkflowChip = (id: WorkflowChipId) => {
    setInput(workflowPrompt(id, threadInteractionMode));
  };

  const profiles = settings?.profiles ?? [];
  const modelConfigured = isAiModelConfigured(settings);
  const activeProfileLabel = formatActiveAiProfileLabel(settings);

  useEffect(() => {
    if (!open) return;
    if (engineerMode === "k8s" && clusterId) {
      bindK8sContext(clusterId, clusterName ?? undefined, clusterTarget);
      return;
    }
    bindContext(sessionId, serverId);
  }, [
    open,
    sessionId,
    serverId,
    engineerMode,
    clusterId,
    clusterName,
    clusterTarget,
    bindContext,
    bindK8sContext,
  ]);

  useEffect(() => {
    if (!composerFocusNonce) return;
    const el = textareaRef.current;
    if (!el) return;
    window.setTimeout(() => {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }, 0);
  }, [composerFocusNonce]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onDoc = (event: MouseEvent) => {
      const t = event.target as Node;
      if (
        attachMenuRef.current?.contains(t) ||
        attachTriggerRef.current?.contains(t)
      ) {
        return;
      }
      setAttachMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc, true);
    return () => document.removeEventListener("mousedown", onDoc, true);
  }, [attachMenuOpen]);

  useLayoutEffect(() => {
    if (!attachMenuOpen || !attachTriggerRef.current) {
      setAttachMenuPos(null);
      return;
    }
    const place = () => {
      const btn = attachTriggerRef.current;
      const menu = attachMenuRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const mw = 168;
      const mh = menu?.offsetHeight ?? 140;
      let top = r.top - mh - 6;
      if (top < 8) top = r.bottom + 6;
      let left = r.right - mw;
      left = Math.min(Math.max(8, left), window.innerWidth - mw - 8);
      setAttachMenuPos({ top, left });
    };
    place();
    requestAnimationFrame(place);
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [attachMenuOpen]);

  useEffect(() => {
    if (!pendingApproval) {
      setConfirmDraft("");
      setRememberRead(false);
      setApproveForSession(false);
      setApprovePermanently(false);
    }
  }, [pendingApproval?.approvalId]);

  useEffect(() => {
    if (!historyOpen && !modelOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".ai-engineer-menu-wrap")) return;
      setHistoryOpen(false);
      setModelOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [historyOpen, modelOpen]);

  // Pin to latest message on open / history restore (before paint when possible).
  useLayoutEffect(() => {
    if (!open) return;
    const el = messagesRef.current;
    if (!el) return;
    scrollMessagesToEnd(el);
  }, [open, messages.length, ready, activeThreadId]);

  useEffect(() => {
    if (!open) return;
    const el = messagesRef.current;
    if (!el) return;

    let cancelled = false;
    const pin = () => {
      if (!cancelled) scrollMessagesToEnd(el);
    };
    pin();
    const raf = window.requestAnimationFrame(pin);
    // Brief ResizeObserver: markdown height settles after first paint; don't keep
    // pinning forever or it fights manual scroll-up.
    const ro = new ResizeObserver(pin);
    ro.observe(el);
    const stopRo = window.setTimeout(() => ro.disconnect(), 400);
    const t1 = window.setTimeout(pin, 50);
    const t2 = window.setTimeout(pin, 250);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      window.clearTimeout(stopRo);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [
    open,
    messages.length,
    messages[messages.length - 1]?.kind === "assistant"
      ? (messages[messages.length - 1] as { content: string }).content.length
      : 0,
    busy,
    modelPhase,
    pendingAsk,
    pendingApproval,
    ready,
    activeThreadId,
  ]);

  const submit = () => {
    if (busy) return;
    void sendMessage({
      sessionId,
      serverId,
      clusterId: engineerMode === "k8s" ? (clusterId ?? undefined) : undefined,
    });
  };

  const panelTitle =
    engineerMode === "k8s"
      ? t("aiEngineer.k8sTitle")
      : t("aiEngineer.linuxTitle");
  const emptyHint =
    engineerMode === "k8s" ? t("aiEngineer.hintK8s") : t("aiEngineer.hint");
  const inputPlaceholder =
    engineerMode === "k8s"
      ? t("aiEngineer.inputPlaceholderK8s")
      : t("aiEngineer.inputPlaceholder");

  if (!open) return null;

  return (
    <>
      <WorkspacePanelBackdrop
        panelId="aiEngineer"
        dismissible={!busy && !settingsOpen}
      />
      <aside
        ref={panelRef}
        className="ai-engineer-panel find-panel"
        style={{ width }}
        aria-label={panelTitle}
      >
        <div
          className="find-panel-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("aiEngineer.resizeAria")}
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startW = width;
            document.body.classList.add("find-panel-resizing");
            const onMove = (ev: MouseEvent) => {
              setWidth(startW - (ev.clientX - startX));
            };
            const onUp = () => {
              document.body.classList.remove("find-panel-resizing");
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        />
        <header className="ai-engineer-head">
          <h2 className="ai-engineer-title" title={threadTitle}>
            {threadTitle}
          </h2>
          <div className="ai-engineer-head-actions">
            <button
              type="button"
              className="ai-engineer-icon-btn"
              onClick={() => createThread()}
              aria-label={t("aiEngineer.newChat")}
              title={t("aiEngineer.newChat")}
            >
              <NewChatIcon />
            </button>
            <div className="ai-engineer-menu-wrap">
              <button
                type="button"
                className="ai-engineer-icon-btn"
                aria-expanded={historyOpen}
                aria-label={t("aiEngineer.history")}
                title={t("aiEngineer.history")}
                onClick={() => {
                  setHistoryOpen((v) => !v);
                  setModelOpen(false);
                }}
              >
                <ChatHistoryIcon />
              </button>
              {historyOpen ? (
                <div className="ai-engineer-menu" role="menu">
                  {threads.length === 0 ? (
                    <div className="ai-engineer-menu-empty">
                      {t("aiEngineer.historyEmpty")}
                    </div>
                  ) : (
                    threads.map((th) => (
                      <div key={th.id} className="ai-engineer-menu-row">
                        <button
                          type="button"
                          className={`ai-engineer-menu-item${th.id === activeThreadId ? " active" : ""}`}
                          role="menuitem"
                          onClick={() => {
                            switchThread(th.id);
                            setHistoryOpen(false);
                          }}
                        >
                          {th.title || t("aiEngineer.newChat")}
                        </button>
                        <button
                          type="button"
                          className="ai-engineer-menu-delete"
                          aria-label={t("aiEngineer.deleteChat")}
                          title={t("aiEngineer.deleteChat")}
                          onClick={() => {
                            if (!window.confirm(t("aiEngineer.deleteChatConfirm"))) {
                              return;
                            }
                            deleteThread(th.id);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            <WorkspacePanelHeadActions
              panelId="aiEngineer"
              sessionId={sessionId}
              serverId={serverId}
            />
          </div>
        </header>
        <div className="find-panel-body ai-engineer-body">
          {bootstrapping ? (
            <div className="ai-engineer-bootstrap">
              <p className="ai-engineer-bootstrap-title">
                {bootstrapPhase
                  ? t(`aiEngineer.bootstrap.${bootstrapPhase}`, {
                      defaultValue: bootstrapStatus ?? t("aiEngineer.starting"),
                    })
                  : bootstrapStatus || t("aiEngineer.starting")}
              </p>
              {bootstrapStatus &&
              (bootstrapPhase === "installing_deps" ||
                bootstrapPhase === "installing_pip") ? (
                <p className="ai-engineer-bootstrap-detail">{bootstrapStatus}</p>
              ) : null}
              <div
                className={`ai-engineer-bootstrap-track${bootstrapProgress == null ? " is-indeterminate" : ""}`}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={bootstrapProgress ?? undefined}
                aria-busy={bootstrapProgress == null ? true : undefined}
                aria-label={t("aiEngineer.bootstrap.progressAria")}
              >
                <div
                  className="ai-engineer-bootstrap-bar"
                  style={{
                    width: `${
                      bootstrapProgress ??
                      (bootstrapPhase === "checking"
                        ? 10
                        : bootstrapPhase === "creating_venv"
                          ? 22
                          : bootstrapPhase === "installing_pip"
                            ? 32
                            : bootstrapPhase === "installing_deps"
                              ? 48
                              : bootstrapPhase === "starting"
                                ? 95
                                : 14)
                    }%`,
                  }}
                />
              </div>
              <p className="ai-engineer-bootstrap-percent">
                {bootstrapProgress != null
                  ? t("aiEngineer.bootstrap.percent", {
                      value: bootstrapProgress,
                    })
                  : t("aiEngineer.bootstrap.working")}
              </p>
            </div>
          ) : null}
          {error ? (
            <div className="ai-engineer-startup-error">
              <p>{error}</p>
              <button type="button" onClick={() => void ensureReady()}>
                {t("aiEngineer.retrySidecar")}
              </button>
            </div>
          ) : null}
          {ready ? (
            <div className="ai-engineer-chat">
              <div className="ai-engineer-messages" ref={messagesRef}>
                {activePlan && activePlan.length > 0 ? (
                  <div className="ai-engineer-plan" aria-label={t("aiEngineer.planTitle")}>
                    <div className="ai-engineer-plan-title">{t("aiEngineer.planTitle")}</div>
                    <ol className="ai-engineer-plan-steps">
                      {activePlan.map((item, idx) => (
                        <li
                          key={`${idx}-${item.step}`}
                          className={`ai-engineer-plan-step is-${item.status}`}
                        >
                          <span className="ai-engineer-plan-marker" aria-hidden />
                          <span>{item.step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
                {activeInvestigation ? (
                  <div
                    className={`ai-engineer-investigation is-${activeInvestigation.status}`}
                    aria-label={t("aiEngineer.investigatorTitle")}
                  >
                    <div className="ai-engineer-investigation-head">
                      <span className="ai-engineer-investigation-title">
                        {t("aiEngineer.investigatorTitle")}
                      </span>
                      <span className="ai-engineer-investigation-status">
                        {activeInvestigation.status === "running"
                          ? t("aiEngineer.investigatorRunning")
                          : activeInvestigation.status === "done"
                            ? t("aiEngineer.investigatorDone")
                            : t("aiEngineer.investigatorFailed")}
                      </span>
                    </div>
                    {activeInvestigation.question ? (
                      <p className="ai-engineer-investigation-question">
                        {activeInvestigation.question}
                      </p>
                    ) : null}
                    {activeInvestigation.summaryPreview ? (
                      <p className="ai-engineer-investigation-summary">
                        {activeInvestigation.summaryPreview}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {!modelConfigured ? (
                  <div className="ai-engineer-configure-model">
                    <p className="ai-engineer-configure-model-title">
                      {t("aiEngineer.configureModelTitle")}
                    </p>
                    <p className="ai-engineer-configure-model-hint">
                      {t("aiEngineer.configureModelHint")}
                    </p>
                    <button
                      type="button"
                      className="find-panel-run"
                      onClick={() => setSettingsOpen(true)}
                    >
                      {t("aiEngineer.configureModelAction")}
                    </button>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="ai-engineer-empty">
                    <p className="find-panel-empty">{emptyHint}</p>
                    <div className="ai-engineer-workflow-chips" role="group">
                      {WORKFLOW_CHIP_IDS.map((id) => (
                        <button
                          key={id}
                          type="button"
                          className="ai-engineer-workflow-chip"
                          disabled={!ready || !modelConfigured}
                          onClick={() => applyWorkflowChip(id)}
                        >
                          {t(`aiEngineer.workflow.${id}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {messages.map((line, index) => {
                  const rowKey = `${line.id}__${index}`;
                  if (line.kind === "notice") {
                    const text =
                      line.variant === "compaction"
                        ? t("aiEngineer.noticeCompaction")
                        : line.variant === "resumed"
                          ? t("aiEngineer.noticeResumed")
                          : line.content;
                    return (
                      <div
                        key={rowKey}
                        className={`ai-engineer-notice ai-engineer-notice-${line.variant}`}
                      >
                        {text}
                      </div>
                    );
                  }
                  if (line.kind === "attachment") {
                    const shortLabel =
                      line.label.includes("/") || line.label.includes("\\")
                        ? line.label.split(/[/\\]/).pop() || line.label
                        : line.label;
                    const canPreview = Boolean(
                      line.mediaUrl ||
                        (line.body && line.body.trim()) ||
                        (line.preview && line.preview.trim()),
                    );
                    return (
                      <button
                        key={rowKey}
                        type="button"
                        className="ai-engineer-attachment-tile"
                        title={line.preview ? `${line.label}\n${line.preview}` : line.label}
                        disabled={!canPreview}
                        onClick={() => {
                          if (line.attachmentKind === "local_image" && line.mediaUrl) {
                            setAttachmentPreview({
                              title: line.label,
                              kind: "image",
                              mediaUrl: line.mediaUrl,
                            });
                            return;
                          }
                          const text = (line.body || line.preview || "").trim();
                          if (!text) return;
                          setAttachmentPreview({
                            title: line.label,
                            kind: "text",
                            text,
                          });
                        }}
                      >
                        {line.attachmentKind === "local_image" && line.mediaUrl ? (
                          <img
                            className="ai-engineer-attach-tile-media history"
                            alt=""
                            src={line.mediaUrl}
                          />
                        ) : (
                          <span
                            className={`ai-engineer-attach-tile-icon kind-${line.attachmentKind}`}
                            aria-hidden
                          >
                            <AttachTileGlyph kind={line.attachmentKind} />
                          </span>
                        )}
                        <span className="ai-engineer-attach-tile-meta">
                          <span className="ai-engineer-attachment-kind">
                            {t(`aiEngineer.attachKind.${line.attachmentKind}`)}
                          </span>
                          <span className="ai-engineer-attach-tile-label">{shortLabel}</span>
                        </span>
                      </button>
                    );
                  }
                  if (line.kind === "tool") {
                    return <ToolExecCard key={rowKey} line={line} t={t} />;
                  }
                  if (line.kind === "ask") {
                    const askActive =
                      Boolean(pendingAsk) &&
                      pendingAsk!.requestId === line.requestId &&
                      !line.answered;
                    return (
                      <div key={rowKey} className="ai-engineer-ask">
                        <div className="ai-engineer-ask-title">{line.question}</div>
                        <div className="ai-engineer-approval-actions">
                          {(line.options ?? []).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              className="find-panel-run"
                              disabled={!askActive}
                              onClick={() => {
                                resolveAsk([opt.id]);
                                setAskDraft("");
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <label className="ai-engineer-dual-confirm">
                          <input
                            value={askActive ? askDraft : ""}
                            onChange={(e) => setAskDraft(e.target.value)}
                            placeholder={t("aiEngineer.askFreeTextPlaceholder")}
                            disabled={!askActive}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                const text = askDraft.trim();
                                if (!text || !askActive) return;
                                resolveAsk([], text);
                                setAskDraft("");
                              }
                            }}
                          />
                        </label>
                        <div className="ai-engineer-approval-actions">
                          <button
                            type="button"
                            className="find-panel-run"
                            disabled={!askActive || !askDraft.trim()}
                            onClick={() => {
                              resolveAsk([], askDraft.trim());
                              setAskDraft("");
                            }}
                          >
                            {t("aiEngineer.askSubmit")}
                          </button>
                        </div>
                        {line.answered ? (
                          <p className="ai-engineer-approval-reason">
                            {t("aiEngineer.askAnswered")}
                          </p>
                        ) : null}
                      </div>
                    );
                  }
                  if (line.kind === "approval") {
                    const dual = Boolean(line.dualConfirm);
                    const phrase = line.confirmPhrase || line.command;
                    const isActive =
                      Boolean(pendingApproval) &&
                      pendingApproval!.approvalId === line.approvalId &&
                      !line.decision;
                    const canApprove =
                      isActive && (!dual || confirmDraft.trim() === phrase);
                    return (
                      <div
                        key={rowKey}
                        className={`ai-engineer-approval${line.decision ? " is-resolved" : ""}`}
                      >
                        <div className="ai-engineer-approval-head">
                          <div className="ai-engineer-approval-title">
                            {t("aiEngineer.approvalTitle")}
                            {line.decision === "approved"
                              ? ` · ${t("aiEngineer.approved")}`
                              : null}
                            {line.decision === "rejected"
                              ? ` · ${t("aiEngineer.rejected")}`
                              : null}
                          </div>
                          <span
                            className="ai-engineer-approval-risk"
                            title={line.risk}
                          >
                            {t(riskLabelKey(line.risk))}
                          </span>
                        </div>
                        {line.intent ? (
                          <section className="ai-engineer-approval-section ai-engineer-approval-section-intent">
                            <span className="ai-engineer-approval-label">
                              {t("aiEngineer.approvalIntentLabel")}
                            </span>
                            <p className="ai-engineer-approval-intent">{line.intent}</p>
                          </section>
                        ) : null}
                        <section className="ai-engineer-approval-section ai-engineer-approval-section-command">
                          <span className="ai-engineer-approval-label">
                            {t("aiEngineer.approvalCommandLabel")}
                          </span>
                          <pre className="ai-engineer-approval-command">
                            <code>{line.command}</code>
                          </pre>
                        </section>
                        {line.execCommand && line.execCommand !== line.command ? (
                          <p className="ai-engineer-approval-reason">
                            {t("aiEngineer.execWrapped")}
                            <code className="ai-engineer-tool-detail">{line.execCommand}</code>
                          </p>
                        ) : null}
                        <section className="ai-engineer-approval-section ai-engineer-approval-section-meta">
                          <span className="ai-engineer-approval-label">
                            {t("aiEngineer.approvalPolicyLabel")}
                          </span>
                          <p className="ai-engineer-approval-reason">
                            {t(riskDescKey(line.risk))}
                          </p>
                        </section>
                        {line.impactPreview ? (
                          <pre className="ai-engineer-impact-preview">{line.impactPreview}</pre>
                        ) : null}
                        {line.networkGuard ? (
                          <p className="ai-engineer-approval-reason">
                            {t("aiEngineer.networkGuard")}
                          </p>
                        ) : null}
                        {dual && isActive ? (
                          <label className="ai-engineer-dual-confirm">
                            {t("aiEngineer.dualConfirmHint")}
                            <input
                              value={confirmDraft}
                              onChange={(e) => setConfirmDraft(e.target.value)}
                              placeholder={phrase}
                              disabled={!isActive}
                            />
                          </label>
                        ) : null}
                        {line.decision ? null : (
                          <div className="ai-engineer-approval-footer">
                            {isActive &&
                            line.rememberableBinaries &&
                            line.rememberableBinaries.length > 0 ? (
                              <label className="ai-engineer-remember-read">
                                <span className="ai-engineer-check">
                                  <input
                                    type="checkbox"
                                    checked={rememberRead}
                                    onChange={(e) => setRememberRead(e.target.checked)}
                                  />
                                  <span className="ai-engineer-check-box" aria-hidden />
                                </span>
                                <span className="ai-engineer-remember-read-text">
                                  {t("aiEngineer.rememberReadOnly", {
                                    tools: line.rememberableBinaries.join(", "),
                                  })}
                                </span>
                              </label>
                            ) : null}
                            {isActive && !dual && threadSecurityMode !== "production" ? (
                              <label className="ai-engineer-remember-read">
                                <span className="ai-engineer-check">
                                  <input
                                    type="checkbox"
                                    checked={approveForSession}
                                    onChange={(e) => setApproveForSession(e.target.checked)}
                                  />
                                  <span className="ai-engineer-check-box" aria-hidden />
                                </span>
                                <span className="ai-engineer-remember-read-text">
                                  {t("aiEngineer.approveForSession")}
                                </span>
                              </label>
                            ) : null}
                            {isActive && !dual && threadSecurityMode !== "production" ? (
                              <label className="ai-engineer-remember-read">
                                <span className="ai-engineer-check">
                                  <input
                                    type="checkbox"
                                    checked={approvePermanently}
                                    onChange={(e) => setApprovePermanently(e.target.checked)}
                                  />
                                  <span className="ai-engineer-check-box" aria-hidden />
                                </span>
                                <span className="ai-engineer-remember-read-text">
                                  {t("aiEngineer.approvePermanently")}
                                </span>
                              </label>
                            ) : null}
                            <div className="ai-engineer-approval-actions">
                            <button
                              type="button"
                              className="find-panel-run"
                              disabled={!canApprove}
                              onClick={() => {
                                resolveApproval(
                                  true,
                                  dual ? confirmDraft.trim() : undefined,
                                  rememberRead,
                                  approveForSession,
                                  approvePermanently,
                                );
                                setConfirmDraft("");
                                setRememberRead(false);
                                setApproveForSession(false);
                                setApprovePermanently(false);
                              }}
                            >
                              {t("aiEngineer.approve")}
                            </button>
                            <button
                              type="button"
                              className="ai-engineer-stop"
                              disabled={!isActive}
                              onClick={() => {
                                resolveApproval(false);
                                setConfirmDraft("");
                                setRememberRead(false);
                                setApproveForSession(false);
                                setApprovePermanently(false);
                              }}
                            >
                              {t("aiEngineer.reject")}
                            </button>
                          </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={rowKey}
                      className={`ai-engineer-line ${line.kind}`}
                      data-ai-assistant={line.kind === "assistant" ? "1" : undefined}
                    >
                      {line.kind === "assistant" ? (
                        <>
                          <AiMarkdown content={line.content} />
                          {line.streaming ? (
                            <span className="ai-engineer-stream-cursor" aria-hidden>
                              ▍
                            </span>
                          ) : null}
                        </>
                      ) : (
                        line.content
                      )}
                    </div>
                  );
                })}
                {busy &&
                !(
                  messages.some(
                    (m) => m.kind === "assistant" && m.streaming && m.content.trim(),
                  ) || modelPhase === "streaming"
                ) ? (
                  <div className="ai-engineer-line thought ai-engineer-typing">
                    {modelPhase === "thinking"
                      ? t("aiEngineer.modelThinking")
                      : t("aiEngineer.running")}
                  </div>
                ) : null}
              </div>
              <div className="ai-engineer-composer">
                {pendingAttachments.length > 0 ? (
                  <div className="ai-engineer-attach-tray">
                    {pendingAttachments.map((a) => {
                      const label =
                        a.kind === "console"
                          ? a.label || t("aiEngineer.attachKind.console")
                          : a.kind === "remote_file"
                            ? a.path.split("/").pop() || a.path
                            : a.name;
                      return (
                        <span
                          key={a.id}
                          className="ai-engineer-attach-tile"
                          title={
                            a.kind === "remote_file"
                              ? a.path
                              : a.kind === "console"
                                ? a.text.slice(0, 200)
                                : a.name
                          }
                        >
                          <button
                            type="button"
                            className="ai-engineer-attach-tile-open"
                            onClick={() => openPendingPreview(a)}
                            aria-label={t("aiEngineer.attachPreview")}
                          >
                            {a.kind === "local_image" && a.data_base64 ? (
                              <img
                                className="ai-engineer-attach-tile-media"
                                alt=""
                                src={`data:${a.media_type};base64,${a.data_base64}`}
                              />
                            ) : (
                              <span
                                className={`ai-engineer-attach-tile-icon kind-${a.kind}`}
                                aria-hidden
                              >
                                <AttachTileGlyph kind={a.kind} />
                              </span>
                            )}
                            <span className="ai-engineer-attach-tile-label">{label}</span>
                          </button>
                          <button
                            type="button"
                            className="ai-engineer-attach-tile-remove"
                            aria-label={t("aiEngineer.attachRemove")}
                            onClick={() => removePendingAttachment(a.id)}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  accept=".txt,.log,.md,.json,.yaml,.yml,.conf,.csv,.sh,.py,.js,.ts,.toml,.ini,.env,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    void onLocalFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={inputPlaceholder}
                  rows={3}
                  disabled={!ready || !modelConfigured}
                  onPaste={onComposerPaste}
                  onKeyDown={(e) => {
                    // Chinese/Japanese IME: Enter confirms composition — don't send yet.
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                />
                <div className="ai-engineer-composer-foot">
                  <div className="ai-engineer-composer-tools">
                    <InteractionModePicker
                      mode={threadInteractionMode}
                      disabled={!ready}
                      open={interactionOpen}
                      onOpenChange={(v) => {
                        setInteractionOpen(v);
                        if (v) {
                          setModelOpen(false);
                          setSecurityOpen(false);
                          setAttachMenuOpen(false);
                          setHistoryOpen(false);
                        }
                      }}
                      onChange={(m) => setThreadInteractionMode(m)}
                    />
                    <div className="ai-engineer-menu-wrap ai-engineer-model-wrap">
                      <button
                        type="button"
                        className="ai-engineer-model-btn"
                        aria-label={t("aiEngineer.modelPicker")}
                        aria-expanded={modelOpen}
                        disabled={!ready}
                        onClick={() => {
                          if (!modelConfigured) {
                            setSettingsOpen(true);
                            return;
                          }
                          setModelOpen((v) => !v);
                          setHistoryOpen(false);
                          setSecurityOpen(false);
                          setInteractionOpen(false);
                          setAttachMenuOpen(false);
                        }}
                      >
                        {modelConfigured
                          ? activeProfileLabel
                          : t("aiEngineer.configureModelTitle")}
                        <span aria-hidden>▾</span>
                      </button>
                      {modelOpen && modelConfigured ? (
                        <div className="ai-engineer-menu ai-engineer-menu-up" role="menu">
                          {profiles.length === 0 ? (
                            <div className="ai-engineer-menu-empty">
                              {t("aiEngineer.noModels")}
                            </div>
                          ) : (
                            profiles.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className={`ai-engineer-menu-item${p.id === settings?.active_profile_id ? " active" : ""}`}
                                role="menuitem"
                                onClick={() => {
                                  void saveSettings({ active_profile_id: p.id });
                                  setModelOpen(false);
                                }}
                              >
                                <span className="ai-engineer-model-name">{p.name}</span>
                                <span className="ai-engineer-model-id">{p.model}</span>
                              </button>
                            ))
                          )}
                          <button
                            type="button"
                            className="ai-engineer-menu-item ai-engineer-menu-manage"
                            role="menuitem"
                            onClick={() => {
                              setModelOpen(false);
                              setSettingsOpen(true);
                            }}
                          >
                            {t("aiEngineer.manageModels")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <SecurityModePicker
                      mode={threadSecurityMode}
                      disabled={!ready}
                      open={securityOpen}
                      onOpenChange={(openSec) => {
                        setSecurityOpen(openSec);
                        if (openSec) {
                          setModelOpen(false);
                          setHistoryOpen(false);
                          setInteractionOpen(false);
                          setAttachMenuOpen(false);
                        }
                      }}
                      onChange={(m) => {
                        setThreadSecurityMode(m);
                        setModelOpen(false);
                        setHistoryOpen(false);
                      }}
                    />
                  </div>
                  <div className="ai-engineer-composer-actions">
                    <div className="ai-engineer-menu-wrap ai-engineer-attach-wrap">
                      <button
                        ref={attachTriggerRef}
                        type="button"
                        className={`ai-engineer-paperclip-btn${attachMenuOpen ? " is-open" : ""}`}
                        aria-label={t("aiEngineer.attachMenu")}
                        aria-expanded={attachMenuOpen}
                        disabled={!ready || !modelConfigured}
                        onClick={() => {
                          setAttachMenuOpen((v) => !v);
                          setModelOpen(false);
                          setSecurityOpen(false);
                          setInteractionOpen(false);
                          setHistoryOpen(false);
                        }}
                      >
                        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
                          <path
                            fill="currentColor"
                            d="M14.8 5.2a2.8 2.8 0 0 0-4 0L5.3 10.7a1.8 1.8 0 1 0 2.5 2.5l4.5-4.5a.75.75 0 1 1 1.1 1.1l-4.5 4.5a3.3 3.3 0 1 1-4.7-4.7l5.5-5.5a4.3 4.3 0 0 1 6.1 6.1l-5.8 5.8a.75.75 0 0 1-1.1-1.1l5.8-5.8a2.8 2.8 0 0 0 0-4Z"
                          />
                        </svg>
                      </button>
                      {attachMenuOpen && attachMenuPos
                        ? createPortal(
                            <div
                              ref={attachMenuRef}
                              className="ai-engineer-menu ai-engineer-attach-menu ai-engineer-menu-portal"
                              role="menu"
                              style={{
                                position: "fixed",
                                top: attachMenuPos.top,
                                left: attachMenuPos.left,
                                width: 168,
                                zIndex: 35100,
                              }}
                            >
                              <button
                                type="button"
                                className="ai-engineer-menu-item"
                                role="menuitem"
                                disabled={busy}
                                onClick={() => {
                                  setAttachMenuOpen(false);
                                  fileInputRef.current?.click();
                                }}
                              >
                                {t("aiEngineer.attachLocal")}
                              </button>
                              <button
                                type="button"
                                className="ai-engineer-menu-item"
                                role="menuitem"
                                onClick={() => {
                                  setAttachMenuOpen(false);
                                  addConsoleFromTerminal();
                                }}
                              >
                                {t("aiEngineer.attachConsole")}
                              </button>
                              <button
                                type="button"
                                className="ai-engineer-menu-item"
                                role="menuitem"
                                disabled={busy}
                                onClick={() => {
                                  setAttachMenuOpen(false);
                                  void addRemotePath();
                                }}
                              >
                                {t("aiEngineer.attachRemote")}
                              </button>
                            </div>,
                            document.body,
                          )
                        : null}
                    </div>
                    {busy ? (
                      <button
                        type="button"
                        className="ai-engineer-composer-submit is-stop"
                        aria-label={t("aiEngineer.stop")}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => stopActiveRun()}
                      >
                        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
                          <rect x="4.5" y="4.5" width="7" height="7" rx="1.25" fill="currentColor" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="ai-engineer-composer-submit is-send"
                        aria-label={t("aiEngineer.send")}
                        disabled={
                          !ready ||
                          !modelConfigured ||
                          (!input.trim() && pendingAttachments.length === 0)
                        }
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={submit}
                      >
                        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
                          <path
                            fill="currentColor"
                            d="M8 3.25 12.75 8H9.75v4.25H6.25V8H3.25L8 3.25Z"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
      {settingsOpen ? <AiEngineerSettings /> : null}
      {attachmentPreview
        ? createPortal(
            <div
              className="ai-engineer-attach-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={attachmentPreview.title}
              onClick={() => setAttachmentPreview(null)}
            >
              <div
                className="ai-engineer-attach-lightbox-card"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="ai-engineer-attach-lightbox-head">
                  <strong className="ai-engineer-attach-lightbox-title">
                    {attachmentPreview.title}
                  </strong>
                  <button
                    type="button"
                    className="ai-engineer-attach-lightbox-close"
                    aria-label={t("aiEngineer.attachPreviewClose")}
                    onClick={() => setAttachmentPreview(null)}
                  >
                    ×
                  </button>
                </div>
                {attachmentPreview.kind === "image" && attachmentPreview.mediaUrl ? (
                  <div className="ai-engineer-attach-lightbox-image-wrap">
                    <img
                      src={attachmentPreview.mediaUrl}
                      alt={attachmentPreview.title}
                    />
                  </div>
                ) : (
                  <pre className="ai-engineer-attach-lightbox-text">
                    {attachmentPreview.text || ""}
                  </pre>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
