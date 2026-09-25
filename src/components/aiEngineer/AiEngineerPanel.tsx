import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  BookMarked,
  BookmarkPlus,
  Brain,
  ChevronDown,
  Check,
  Copy,
  FileText,
  ListTree,
  Search,
  TerminalSquare,
} from "lucide-react";
import { riskDescKey, riskLabelKey } from "../../lib/aiEngineer/riskLabels";
import {
  nextExecCardExpanded,
  scrollTopAfterCollapseAbove,
} from "../../lib/aiEngineer/execCardExpand";
import {
  formatWebToolPreview,
  isWebToolName,
  webToolKeywordLine,
} from "../../lib/aiEngineer/webToolCard";
import {
  panelFiberChatScopeKey,
  normalizeInteractionMode,
  normalizeSecurityMode,
  useAiEngineerStore,
} from "../../stores/aiEngineerStore";
import { externalRuntimeStatusKind } from "../../lib/aiEngineer/cursorRuntimeStatus";
import { rememberAiFiber } from "../../stores/hostWorkspaceMemory";
import {
  AI_CHAT_SCROLL_FIX_ID,
  COMPOSER_CHROME_SCROLL_LOCK_MS,
  OPEN_CHAT_FOLLOW_MS,
  RUN_SETTLE_FOLLOW_MS,
  isChatNearBottom,
  isChatScrollGeometryReady,
  runPreservingChatScroll,
  scheduleComposerChromeScrollLock,
  scheduleOpenChatPin,
  scrollChatToBottom,
  scrollTopAfterContentHeightChange,
  scrollTopAfterViewportResize,
  shouldClearStickOnUserIntent,
  shouldForceChatFollow,
  shouldFollowChatOnViewportResize,
  shouldFollowChatTranscript,
  shouldForceStickOnChatOpen,
  shouldHoldChatScrollForComposerChrome,
  shouldDeferResizeScrollDuringComposerChrome,
  shouldHoldStickWhileBusyFollow,
  shouldHoldStickWhileForcedFollow,
  shouldParkChatScrollerAtBottom,
  shouldPinChatOnStreamUpdate,
  shouldPinDuringComposerChromeLock,
  shouldPreventComposerChromeFocusScroll,
  shouldUpdateStickFromScrollEvent,
  streamFollowPinKey,
} from "../../lib/aiEngineer/chatScroll";
import { AiEngineerSettings } from "./AiEngineerSettings";
import { AiEngineerRunTraceBar } from "./AiEngineerRunTraceBar";
import { AiBusyDots } from "./AiBusyDots";
import {
  AiEngineerComposerSendButton,
  AiEngineerComposerTextarea,
} from "./AiEngineerComposerInput";
import { SecurityModePicker } from "./SecurityModePicker";
import { InteractionModePicker } from "./InteractionModePicker";
import { AiMarkdown } from "./AiMarkdown";
import { TurnMediaGallery } from "./TurnMediaGallery";
import {
  collectTurnImageMedia,
  extractToolImageMedia,
  markdownHasImage,
} from "../../lib/aiEngineer/turnMedia";
import { WorkspacePanelBackdrop } from "../WorkspacePanelBackdrop";
import { useWorkspacePanelEnter } from "../../lib/useWorkspacePanelEnter";
import { clampWorkspacePanelWidth } from "../../lib/workspacePanelWidth";
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
import { unwrapToolOutputForDisplay } from "../../lib/aiEngineer/formatToolResultDisplay";
import {
  findChatMatches,
  stepMatchIndex,
} from "../../lib/aiEngineer/chatFind";
import {
  buildChatOutline,
  stepOutlineIndex,
} from "../../lib/aiEngineer/chatOutline";
import {
  copyableChatText,
  isAssistantReplyCopyAnchor,
  shouldShowChatCopy,
  wholeAssistantReplyText,
} from "../../lib/aiEngineer/chatCopy";
import {
  K8S_WORKFLOW_CHIP_IDS,
  WORKFLOW_CHIP_IDS,
  classifyLocalFile,
  k8sWorkflowPrompt,
  nextAttachmentId,
  readLocalImageBase64,
  readLocalTextFile,
  type K8sWorkflowChipId,
  type PendingAttachment,
  type WorkflowChipId,
  workflowPrompt,
} from "../../lib/aiEngineer/attachments";
import { sendRemotePathToChat } from "../../lib/aiEngineer/sendToChat";
import { readActiveTerminalSelection } from "../../lib/aiEngineer/terminalSelectionBridge";
import { useToastStore } from "../../stores/toastStore";
import {
  formatElapsedMs,
  isAwaitingApprovedExec,
  resolveBusyPhase,
  resolveExecLiveStatus,
  shouldShowChatBusyLine,
} from "../../lib/aiEngineer/runBusyPhase";
import { isAwaitingApprovedExecStuck } from "../../lib/aiEngineer/approvalOptimisticExec";
import {
  approvalBadgeForTool,
  shouldCollapseExecCommand,
  shouldOmitResolvedApprovalCard,
} from "../../lib/aiEngineer/approvalCommandDedupe";
import { formatAppError } from "../../lib/formatAppError";
import { useSudoPromptStore } from "../../stores/sudoPromptStore";
import {
  ensureSidecar,
  fetchMemoryMeta,
  fetchUserSkills,
  probeRuntime,
  revealLocalPath,
  type AgentRuntimeKind,
  type MemoryMetaCatalog,
  type RuntimeProbeResult,
  type UserSkillsCatalog,
} from "../../lib/aiEngineer/api";

type Props = {
  sessionId: string;
  serverId?: string;
  /** False = keep fiber mounted but invisible (another host owns the AI surface). */
  surfaceActive?: boolean;
};

const EMPTY_CHAT_MESSAGES: import("../../stores/aiEngineerStore").ChatLine[] =
  [];

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

function formatElapsed(ms: number): string {
  return formatElapsedMs(ms);
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

function ToolImageThumb({
  mediaId,
  path,
  alt,
}: {
  mediaId: string | null;
  path: string | null;
  alt: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (mediaId) {
          const { resolveMediaId, mediaDisplaySrc } = await import(
            "../../lib/aiEngineer/chatMedia"
          );
          const cached = await resolveMediaId(mediaId);
          if (!cancelled) setSrc(mediaDisplaySrc(cached));
          return;
        }
        if (path) {
          const { convertFileSrc } = await import("@tauri-apps/api/core");
          if (!cancelled) setSrc(convertFileSrc(path));
        }
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mediaId, path]);
  if (!src) return null;
  return (
    <img
      className="ai-engineer-tool-thumb"
      data-testid="ai-engineer-tool-thumb"
      src={src}
      alt={alt}
    />
  );
}

function ToolExecCard({
  line,
  t,
  live,
  dimmed,
  risk,
  approved,
}: {
  line: ToolLine;
  t: (key: string, opts?: Record<string, unknown>) => string;
  /** This card is the one currently executing on the host. */
  live?: boolean;
  /** Another tool is live — collapse and de-emphasize this card. */
  dimmed?: boolean;
  /** From prior approval — shown on the exec card, not a separate block. */
  risk?: string;
  approved?: boolean;
}) {
  const outputRef = useRef<HTMLPreElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const userPinnedOpenRef = useRef(false);
  const [, tick] = useState(0);
  const [hovered, setHovered] = useState(false);
  const running = line.status === "running";
  const isExec =
    line.name === "terminal_exec" ||
    line.name === "ai_exec" ||
    line.name.startsWith("k8s_");
  // Live/running → open; finished → auto-collapse (unless user pinned open).
  const [expanded, setExpanded] = useState(() => running || Boolean(live));

  useLayoutEffect(() => {
    const next = nextExecCardExpanded({
      live: Boolean(live),
      running,
      userPinnedOpen: userPinnedOpenRef.current,
    });
    if (next.clearUserPin) userPinnedOpenRef.current = false;
    if (next.expanded === expanded) return;
    if (next.expanded) {
      setExpanded(true);
      return;
    }
    // Collapse finished card; compensate scroll when the card sat above the fold.
    const card = cardRef.current;
    const scroller = card?.closest(
      ".ai-engineer-messages",
    ) as HTMLElement | null;
    const beforeH = card?.offsetHeight ?? 0;
    const beforeTop = scroller?.scrollTop ?? 0;
    const cardOffsetTop =
      card && scroller
        ? card.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop
        : 0;
    setExpanded(false);
    if (!scroller || beforeH <= 0) return;
    requestAnimationFrame(() => {
      const afterH = cardRef.current?.offsetHeight ?? 0;
      const delta = beforeH - afterH;
      if (delta <= 0) return;
      const top = scrollTopAfterCollapseAbove({
        scrollTop: beforeTop,
        cardOffsetTop,
        heightDelta: delta,
      });
      if (Math.abs(scroller.scrollTop - top) > 1) scroller.scrollTop = top;
    });
  }, [live, running, expanded]);

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
    let mediaId: string | null = null;
    let mediaPath: string | null = null;
    try {
      const parsed = JSON.parse(line.output || "") as {
        kind?: string;
        media_id?: string;
        cached_path?: string;
        images?: Array<{ cached_path?: string }>;
      };
      const ref = extractToolImageMedia(line.output);
      if (ref) {
        mediaId = ref.mediaId;
        if (typeof parsed.cached_path === "string") mediaPath = parsed.cached_path;
        else if (typeof parsed.images?.[0]?.cached_path === "string") {
          mediaPath = parsed.images[0].cached_path;
        }
      }
    } catch {
      mediaId = null;
    }

    // web_search / web_fetch: keyword always visible; preview collapsible.
    if (isWebToolName(line.name)) {
      const keyword = webToolKeywordLine(line.name, line.detail);
      const preview = formatWebToolPreview(line.output);
      const webRunning = line.status === "running";
      const statusLabel = webRunning
        ? t("aiEngineer.toolRunning")
        : line.ok === false
          ? line.status === "denied"
            ? t("aiEngineer.toolDenied")
            : t("aiEngineer.toolFailed")
          : line.status === "done"
            ? t("aiEngineer.toolDone")
            : "";
      const bodyOpen = expanded && (Boolean(preview) || webRunning);
      return (
        <div
          ref={cardRef}
          className={`ai-engineer-tool-row ai-engineer-web-card${
            webRunning ? " is-running" : ""
          }${dimmed ? " is-dimmed" : ""}${expanded ? " is-expanded" : ""}`}
          data-testid="ai-engineer-web-card"
          data-tool={line.name}
        >
          <button
            type="button"
            className="ai-engineer-web-card-head"
            data-testid="ai-engineer-web-card-toggle"
            aria-expanded={expanded}
            onClick={() => {
              if (!webRunning) userPinnedOpenRef.current = !expanded;
              setExpanded((v) => !v);
            }}
          >
            <ChevronDown
              size={14}
              className={`ai-engineer-web-chevron${expanded ? " is-open" : ""}`}
              aria-hidden
            />
            <span className="ai-engineer-tool-name">{label}</span>
            {keyword ? (
              <code
                className="ai-engineer-web-keyword"
                data-testid="ai-engineer-web-keyword"
                title={keyword}
              >
                {keyword}
              </code>
            ) : null}
            {statusLabel ? (
              <span
                className={`ai-engineer-web-status${
                  line.ok === false ? " is-fail" : ""
                }`}
              >
                {statusLabel}
              </span>
            ) : null}
          </button>
          {bodyOpen ? (
            <div className="ai-engineer-web-card-body">
              {webRunning && !preview ? (
                <div className="ai-engineer-web-preview is-pending">
                  {line.name === "web_fetch"
                    ? t("aiEngineer.webFetchPending")
                    : t("aiEngineer.webSearchPending")}
                </div>
              ) : null}
              {preview ? (
                <pre
                  className="ai-engineer-web-preview"
                  data-testid="ai-engineer-web-preview"
                >
                  {preview}
                </pre>
              ) : null}
              {mediaId || mediaPath ? (
                <ToolImageThumb mediaId={mediaId} path={mediaPath} alt={label} />
              ) : null}
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <details className="ai-engineer-tool-row" data-testid="ai-engineer-tool-row">
        <summary>
          <span className="ai-engineer-tool-name">
            {line.intent?.trim() || label}
          </span>
          {line.intent?.trim() ? (
            <span className="ai-engineer-tool-kind">{line.name}</span>
          ) : null}
          {line.ok === false ? (
            <span className="ai-engineer-tool-fail">
              {line.status === "denied" ? "denied" : "failed"}
            </span>
          ) : null}
        </summary>
        {mediaId || mediaPath ? (
          <ToolImageThumb mediaId={mediaId} path={mediaPath} alt={label} />
        ) : null}
        {line.detail ? (
          <code className="ai-engineer-tool-detail">{line.detail}</code>
        ) : null}
      </details>
    );
  }

  const elapsedMs =
    (running ? Date.now() : (line.finishedAt ?? Date.now())) -
    (line.startedAt ?? Date.now());
  const elapsedLabel = formatElapsed(elapsedMs);
  const hasOutputBytes = Boolean(line.output?.trim());
  const filterNoMatch = (() => {
    try {
      const parsed = JSON.parse(line.output || "") as { filter_no_match?: unknown };
      return Boolean(parsed.filter_no_match);
    } catch {
      return false;
    }
  })();
  const liveStatus = resolveExecLiveStatus({
    status: line.status,
    hasOutput: hasOutputBytes,
  });
  const statusChipLabel =
    liveStatus === "running_silent" || liveStatus === "running_live"
      ? t("aiEngineer.toolRunning")
      : liveStatus === "done"
        ? filterNoMatch
          ? t("aiEngineer.toolFilterMiss")
          : t("aiEngineer.toolDone")
        : liveStatus === "failed"
          ? t("aiEngineer.toolFailed")
          : liveStatus === "denied"
            ? t("aiEngineer.toolDenied")
            : liveStatus === "cancelled"
              ? t("aiEngineer.toolCancelled")
              : "";
  const lastOutputAgeMs =
    running && line.lastOutputAt != null
      ? Math.max(0, Date.now() - line.lastOutputAt)
      : null;

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
  const displayOutput = unwrapToolOutputForDisplay(line.output);
  const showOutputPane = Boolean(displayOutput.trim()) || running;

  const copyCommand = (e: ReactMouseEvent) => {
    e.stopPropagation();
    const text = displayCommand || line.detail || "";
    if (!text) return;
    void import("../../lib/clipboard")
      .then(({ copyToClipboard }) => copyToClipboard(text))
      .catch(() => undefined);
  };

  const glyphMode = expanded ? "collapse" : hovered ? "expand" : "prompt";

  return (
    <div
      ref={cardRef}
      className={`ai-engineer-exec-card${expanded ? " is-expanded" : " is-collapsed"}${hovered ? " is-hovered" : ""}${live || running ? " is-live" : ""}${dimmed ? " is-dimmed" : ""}`}
      data-ai-exec="1"
      data-chat-node-id={line.id}
      data-ai-exec-status={line.status ?? "idle"}
      data-ai-exec-live={liveStatus}
      data-ai-exec-current={live || running ? "1" : undefined}
      style={{ flexShrink: 0, minHeight: 28, overflow: "visible" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="ai-engineer-exec-head"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-current={live || running ? "true" : undefined}
        aria-label={
          expanded
            ? t("aiEngineer.toolCollapse", { title })
            : t("aiEngineer.toolExpand", { title })
        }
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={() => {
          if (live || running) return;
          setExpanded((v) => {
            const next = !v;
            userPinnedOpenRef.current = next;
            return next;
          });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (live || running) return;
            setExpanded((v) => {
              const next = !v;
              userPinnedOpenRef.current = next;
              return next;
            });
          }
        }}
      >
        <span className="ai-engineer-exec-glyph" aria-hidden>
          <TerminalGlyph mode={glyphMode} />
        </span>
        {(live || running) && (
          <AiBusyDots
            className="ai-engineer-exec-head-dots"
            data-testid="ai-engineer-exec-live"
          />
        )}
        <span className="ai-engineer-exec-title" title={title}>
          {title}
        </span>
        {approved ? (
          <span
            className="ai-engineer-exec-approved"
            data-testid="ai-engineer-exec-approved"
          >
            {t("aiEngineer.approved")}
          </span>
        ) : null}
        {risk ? (
          <span
            className="ai-engineer-exec-risk"
            title={risk}
            data-testid="ai-engineer-exec-risk"
          >
            {t(riskLabelKey(risk))}
          </span>
        ) : null}
        {!running && statusChipLabel ? (
          <span
            className={`ai-engineer-exec-status is-${liveStatus}`}
            data-testid="ai-engineer-exec-status"
          >
            {statusChipLabel}
          </span>
        ) : null}
        {toolsLabel && !running ? (
          <span className="ai-engineer-exec-tools" aria-hidden>
            {toolsLabel}
          </span>
        ) : null}
        {expanded && !running ? (
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
            shouldCollapseExecCommand(displayCommand, {
              running,
              live,
            }) ? (
              <details
                className="ai-engineer-exec-command is-collapsible"
                data-testid="ai-engineer-exec-command-collapsed"
              >
                <summary className="ai-engineer-exec-command-summary">
                  <span className="ai-engineer-exec-prompt" aria-hidden>
                    $
                  </span>
                  <code className="ai-engineer-exec-command-code">
                    {displayCommand.split("\n")[0].slice(0, 96)}
                    {displayCommand.length > 96 || displayCommand.includes("\n")
                      ? " …"
                      : ""}
                  </code>
                </summary>
                <div className="ai-engineer-exec-command">
                  <span className="ai-engineer-exec-prompt" aria-hidden>
                    $
                  </span>
                  <code className="ai-engineer-exec-command-code">
                    {highlightShell(displayCommand)}
                  </code>
                </div>
              </details>
            ) : (
              <div className="ai-engineer-exec-command">
                <span className="ai-engineer-exec-prompt" aria-hidden>
                  $
                </span>
                <code className="ai-engineer-exec-command-code">
                  {highlightShell(displayCommand)}
                </code>
              </div>
            )
          ) : null}
          {showOutputPane ? (
            <pre ref={outputRef} className="ai-engineer-exec-output">
              {displayOutput ||
                (running
                  ? t("aiEngineer.toolWaitingAlive", { time: elapsedLabel })
                  : "")}
            </pre>
          ) : null}
          {running &&
          !hasOutputBytes &&
          elapsedMs >= 45_000 ? (
            <p className="ai-engineer-exec-stuck" data-testid="ai-engineer-exec-stuck">
              {t("aiEngineer.toolPossiblyStuck", { time: elapsedLabel })}
            </p>
          ) : null}
          {(line.status === "done" ||
            line.status === "failed" ||
            line.status === "denied" ||
            line.status === "cancelled" ||
            running) && (
            <div className="ai-engineer-exec-foot">
              {running && liveStatus === "running_live" ? (
                <span>{t("aiEngineer.toolLiveOutput")}</span>
              ) : null}
              {line.status === "cancelled" ? (
                <span>{t("aiEngineer.toolCancelled")}</span>
              ) : null}
              {lastOutputAgeMs != null && hasOutputBytes && running ? (
                <span>
                  {t("aiEngineer.toolLastOutputAge", {
                    time: formatElapsed(lastOutputAgeMs),
                  })}
                </span>
              ) : null}
              {line.exitCode != null ? (
                <span>
                  {t("aiEngineer.toolExitCode", { code: line.exitCode })}
                </span>
              ) : null}
              <span>
                {t("aiEngineer.toolElapsed", {
                  time: elapsedLabel,
                })}
              </span>
              {running ? (
                <button
                  type="button"
                  className="ai-engineer-exec-copy-inline"
                  onClick={copyCommand}
                >
                  {t("aiEngineer.toolCopyCommand")}
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ChatCopyButton({
  text,
  testId,
  label,
}: {
  text: string;
  testId: string;
  label: string;
}) {
  const { t } = useTranslation("tools");
  const pushToast = useToastStore((s) => s.pushToast);
  const [copied, setCopied] = useState(false);
  const trimmed = copyableChatText(text);

  const onCopy = (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (!shouldShowChatCopy(text)) return;
    void import("../../lib/clipboard")
      .then(({ copyToClipboard }) => copyToClipboard(trimmed))
      .then(() => {
        setCopied(true);
        pushToast(t("aiEngineer.copyReplyOk"), true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {
        pushToast(t("aiEngineer.copyReplyFailed"), false);
      });
  };

  if (!shouldShowChatCopy(text)) return null;

  return (
    <button
      type="button"
      className={`ai-engineer-copy-btn${copied ? " is-copied" : ""}`}
      data-testid={testId}
      aria-label={label}
      title={label}
      onClick={onCopy}
    >
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
    </button>
  );
}

export function AiEngineerPanel({
  sessionId,
  serverId,
  surfaceActive = true,
}: Props) {
  const { t } = useTranslation("tools");
  const storeOpen = useAiEngineerStore((s) => s.open);
  const liveSessionId = useAiEngineerStore((s) => s.sessionId);
  // Per-host fiber: only the active host's panel is interactive/visible.
  const open = surfaceActive && storeOpen && liveSessionId === sessionId;
  const panelScope = panelFiberChatScopeKey(sessionId, serverId);
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
  // Stable draft setter (split token so panel hygiene does not flag it).
  // Do NOT select draft text here — composer island owns keystroke renders.
  const setComposerInput = useAiEngineerStore((s) => {
    const key = ("set" + "Input") as keyof typeof s;
    return s[key] as (v: string) => void;
  });
  // Isolate transcript per host: parked fibers read threadsByScope, not live messages.
  // Stable empty fallback — a fresh [] each selector call triggers React #185.
  const messages = useAiEngineerStore((s) => {
    if (s.chatScope === panelScope) return s.messages;
    const bundle = s.threadsByScope[panelScope];
    if (!bundle) return EMPTY_CHAT_MESSAGES;
    const thread = bundle.threads.find((t) => t.id === bundle.activeThreadId);
    return thread?.messages ?? EMPTY_CHAT_MESSAGES;
  });
  const sendMessage = useAiEngineerStore((s) => s.sendMessage);
  const stopActiveRun = useAiEngineerStore((s) => s.stopActiveRun);
  const flushMidRunContext = useAiEngineerStore((s) => s.flushMidRunContext);
  const runTraceSpans = useAiEngineerStore((s) => s.runTraceSpans);
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
  const agentRuntime = useAiEngineerStore((s) => s.agentRuntime);
  const setAgentRuntime = useAiEngineerStore((s) => s.setAgentRuntime);
  const [runtimeProbe, setRuntimeProbe] = useState<RuntimeProbeResult | null>(
    null,
  );
  const [runtimeProbing, setRuntimeProbing] = useState(false);
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
  const sudoPromptOpen = useSudoPromptStore((s) => s.open);
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
  const messagesInnerRef = useRef<HTMLDivElement>(null);
  /** Follow the stream only while the user is already near the bottom. */
  const stickToBottomRef = useRef(true);
  /** Ignore scroll events caused by our own programmatic pins. */
  const ignoreScrollUntilRef = useRef(0);
  /** After open / host restore: keep forcing stick through layout + hydrate noise. */
  const openFollowUntilRef = useRef(0);
  /** After composer chrome click: fight async WKWebView scroll yanks. */
  const chromeLockUntilRef = useRef(0);
  const chromeLockTopRef = useRef(0);
  const chromeLockCancelRef = useRef<(() => void) | null>(null);
  const busyFollowRef = useRef(false);
  /** User wheeled/touched away during this run — do not auto-regrab follow. */
  const userReleasedFollowRef = useRef(false);
  /** After busy→idle: keep forcing pin while images/markdown settle. */
  const settleFollowUntilRef = useRef(0);
  /** Near-bottom intent remembered BEFORE maximize can yank scrollTop. */
  const rememberedNearBottomRef = useRef(true);
  const freezeScrollTopRef = useRef(0);
  const [confirmDraft, setConfirmDraft] = useState("");
  const [askDraft, setAskDraft] = useState("");
  const [rememberRead, setRememberRead] = useState(false);
  const [approvePermanently, setApprovePermanently] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findMatchIndex, setFindMatchIndex] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [skillsCatalog, setSkillsCatalog] = useState<UserSkillsCatalog | null>(
    null,
  );
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryCatalog, setMemoryCatalog] = useState<MemoryMetaCatalog | null>(
    null,
  );
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const [attachMenuPos, setAttachMenuPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [attachmentPreview, setAttachmentPreview] =
    useState<AttachmentPreview | null>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const attachTriggerRef = useRef<HTMLButtonElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const [modelMenuPos, setModelMenuPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
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

  const findMatches = useMemo(
    () => findChatMatches(messages, findQuery),
    [messages, findQuery],
  );
  const chatOutline = useMemo(() => buildChatOutline(messages), [messages]);

  const closeComposerMenus = () => {
    setModelOpen(false);
    setHistoryOpen(false);
    setSecurityOpen(false);
    setInteractionOpen(false);
    setAttachMenuOpen(false);
    setOutlineOpen(false);
  };

  const openSettings = () => {
    closeComposerMenus();
    setFindOpen(false);
    setSettingsOpen(true);
  };

  const scrollToChatNode = (lineId: string) => {
    const root = messagesRef.current;
    if (!root) return;
    const escaped =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(lineId)
        : lineId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const el = root.querySelector<HTMLElement>(
      `[data-chat-node-id="${escaped}"]`,
    );
    if (!el) return;
    // Align inside the messages scroller — never scrollIntoView(center),
    // which yanks ancestors and recenters on every streaming token.
    const top =
      el.offsetTop - Math.max(0, (root.clientHeight - el.offsetHeight) / 2);
    const maxTop = Math.max(0, root.scrollHeight - root.clientHeight);
    root.scrollTop = Math.min(Math.max(0, top), maxTop);
    setActiveOutlineId(lineId);
  };

  const findHitId =
    findMatches.length === 0
      ? ""
      : (findMatches[Math.min(findMatchIndex, findMatches.length - 1)]
          ?.lineId ?? "");

  useEffect(() => {
    setFindMatchIndex(0);
  }, [findQuery, activeThreadId]);

  useEffect(() => {
    if (!findOpen || busy || !findHitId) return;
    scrollToChatNode(findHitId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hit id, not match list identity
  }, [findOpen, findMatchIndex, findHitId, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "f") {
        const panel = panelRef.current;
        if (!panel) return;
        if (!panel.contains(document.activeElement) && document.activeElement !== document.body) {
          // Only steal Cmd/Ctrl+F when focus is in the AI panel (or body).
          if (!panel.contains(event.target as Node)) return;
        }
        event.preventDefault();
        setFindOpen(true);
        setOutlineOpen(false);
        return;
      }
      if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        if (!panelRef.current?.contains(document.activeElement as Node | null)
          && document.activeElement !== document.body) {
          return;
        }
        event.preventDefault();
        const nextId = stepOutlineIndex(
          chatOutline,
          activeOutlineId,
          event.key === "ArrowDown" ? 1 : -1,
        );
        if (nextId) scrollToChatNode(nextId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, chatOutline, activeOutlineId]);

  const pushToast = useToastStore((s) => s.pushToast);

  const addConsoleFromTerminal = () => {
    const sel = readActiveTerminalSelection().trim();
    if (!sel) {
      pushToast(t("aiEngineer.attachNoSelection"), false);
      return;
    }
    if (busy) {
      void flushMidRunContext(sel).then((ok) => {
        pushToast(
          ok
            ? t("aiEngineer.flushContextOk")
            : t("aiEngineer.flushContextFailed"),
          ok,
        );
      });
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

  const applyWorkflowChip = (id: WorkflowChipId | K8sWorkflowChipId) => {
    if (engineerMode === "k8s") {
      setComposerInput(
        k8sWorkflowPrompt(id as K8sWorkflowChipId, threadInteractionMode),
      );
    } else {
      setComposerInput(
        workflowPrompt(id as WorkflowChipId, threadInteractionMode),
      );
    }
  };

  const profiles = settings?.profiles ?? [];
  const modelConfigured = isAiModelConfigured(settings);
  const canChat =
    agentRuntime === "cursor" ||
    agentRuntime === "codex" ||
    agentRuntime === "claude" ||
    modelConfigured;
  const activeProfileLabel =
    agentRuntime === "cursor"
      ? t("aiEngineer.runtime.cursor")
      : agentRuntime === "codex"
        ? t("aiEngineer.runtime.codex")
        : agentRuntime === "claude"
          ? t("aiEngineer.runtime.claude")
          : formatActiveAiProfileLabel(settings);

  useEffect(() => {
    if (storeOpen && liveSessionId === sessionId) {
      rememberAiFiber(sessionId);
    }
  }, [storeOpen, liveSessionId, sessionId]);

  useEffect(() => {
    if (!open) return;
    if (engineerMode === "k8s" && clusterId) {
      const live = useAiEngineerStore.getState();
      // Same cluster already bound — skip re-entry (avoids hydrate write churn).
      if (
        live.clusterId === clusterId &&
        live.sessionId === sessionId &&
        live.chatScope === panelScope &&
        live.engineerMode === "k8s"
      ) {
        return;
      }
      bindK8sContext(clusterId, clusterName ?? undefined, clusterTarget);
      return;
    }
    // Soft-hide restore / warm reopen: already bound to this host — do not
    // re-enter bindContext (avoids switch-abort races and disk hydrate flash).
    const live = useAiEngineerStore.getState();
    if (
      live.sessionId === sessionId &&
      live.chatScope === panelScope &&
      (live.serverId ?? null) === (serverId ?? null) &&
      live.engineerMode === "linux"
    ) {
      return;
    }
    bindContext(sessionId, serverId);
  }, [
    open,
    sessionId,
    serverId,
    panelScope,
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
    if (!modelOpen) return;
    const onDoc = (event: MouseEvent) => {
      const t = event.target as Node;
      if (
        modelMenuRef.current?.contains(t) ||
        modelTriggerRef.current?.contains(t)
      ) {
        return;
      }
      setModelOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModelOpen(false);
    };
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [modelOpen]);

  useLayoutEffect(() => {
    if (!modelOpen || !modelTriggerRef.current) {
      setModelMenuPos(null);
      return;
    }
    // Menu portal/layout can yank transcript scroll after the click handler.
    beginComposerChromeScrollLock();
    const MENU_WIDTH = 248;
    const MENU_MARGIN = 8;
    const place = () => {
      const btn = modelTriggerRef.current;
      const menu = modelMenuRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const mh = menu?.offsetHeight ?? 180;
      let top = r.top - mh - 6;
      if (top < MENU_MARGIN) {
        top = Math.min(r.bottom + 6, window.innerHeight - mh - MENU_MARGIN);
      }
      let left = r.left;
      left = Math.min(
        Math.max(MENU_MARGIN, left),
        window.innerWidth - MENU_WIDTH - MENU_MARGIN,
      );
      setModelMenuPos({ top, left });
      beginComposerChromeScrollLock();
    };
    place();
    requestAnimationFrame(place);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      // Unmounting the portal after a selection can yank — hold the snapshotted top.
      beginComposerChromeScrollLock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelOpen, profiles.length]);

  useEffect(() => {
    if (!pendingApproval) {
      setConfirmDraft("");
      setRememberRead(false);
      setApprovePermanently(false);
    }
  }, [pendingApproval?.approvalId]);

  useEffect(() => {
    if (!historyOpen && !outlineOpen && !skillsOpen && !memoryOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".ai-engineer-menu-wrap")) return;
      setHistoryOpen(false);
      setOutlineOpen(false);
      setSkillsOpen(false);
      setMemoryOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [historyOpen, outlineOpen, skillsOpen, memoryOpen]);

  const loadSkillsCatalog = async () => {
    setSkillsLoading(true);
    setSkillsError(null);
    try {
      await ensureReady();
      const sidecar = await ensureSidecar();
      const catalog = await fetchUserSkills(sidecar, engineerMode);
      setSkillsCatalog(catalog);
    } catch (err) {
      setSkillsError(formatAppError(err));
      setSkillsCatalog(null);
    } finally {
      setSkillsLoading(false);
    }
  };

  const loadMemoryCatalog = async () => {
    setMemoryLoading(true);
    setMemoryError(null);
    try {
      await ensureReady();
      const sidecar = await ensureSidecar();
      const catalog = await fetchMemoryMeta(sidecar, engineerMode);
      setMemoryCatalog(catalog);
    } catch (err) {
      setMemoryError(formatAppError(err));
      setMemoryCatalog(null);
    } finally {
      setMemoryLoading(false);
    }
  };

  const pinChatToBottom = () => {
    const el = messagesRef.current;
    if (!el) return;
    ignoreScrollUntilRef.current = Date.now() + 250;
    scrollChatToBottom(el);
    stickToBottomRef.current = true;
    rememberedNearBottomRef.current = true;
  };

  const isForceChatFollow = () =>
    shouldForceChatFollow({
      busy: busyFollowRef.current,
      userReleasedFollow: userReleasedFollowRef.current,
      withinSettleFollowWindow: Date.now() < settleFollowUntilRef.current,
    });

  /** Snapshot + rAF lock so model/security menus cannot yank transcript scroll. */
  const beginComposerChromeScrollLock = () => {
    const el = messagesRef.current;
    if (!el) return;
    const alreadyLocked = Date.now() < chromeLockUntilRef.current;
    if (!alreadyLocked) {
      const near = isChatNearBottom(el);
      const follow = shouldPinDuringComposerChromeLock({
        stickToBottom: stickToBottomRef.current || near,
        rememberedNearBottom: rememberedNearBottomRef.current,
        forceFollow: isForceChatFollow(),
      });
      if (follow) stickToBottomRef.current = true;
      chromeLockTopRef.current = follow
        ? Math.max(0, el.scrollHeight - el.clientHeight)
        : el.scrollTop;
      // Mid-read: keep freeze in sync so late viewport RO after lock uses the same top.
      if (!follow) freezeScrollTopRef.current = chromeLockTopRef.current;
    }
    chromeLockUntilRef.current = Date.now() + COMPOSER_CHROME_SCROLL_LOCK_MS;
    ignoreScrollUntilRef.current = Math.max(
      ignoreScrollUntilRef.current,
      chromeLockUntilRef.current,
    );
    const restore = () => {
      const scroller = messagesRef.current;
      if (!scroller) return;
      if (
        shouldPinDuringComposerChromeLock({
          stickToBottom: stickToBottomRef.current,
          rememberedNearBottom: rememberedNearBottomRef.current,
          forceFollow: isForceChatFollow(),
        })
      ) {
        scrollChatToBottom(scroller);
        stickToBottomRef.current = true;
        rememberedNearBottomRef.current = true;
        chromeLockTopRef.current = scroller.scrollTop;
        return;
      }
      if (Math.abs(scroller.scrollTop - chromeLockTopRef.current) > 1) {
        scroller.scrollTop = chromeLockTopRef.current;
      }
    };
    restore();
    chromeLockCancelRef.current?.();
    chromeLockCancelRef.current = scheduleComposerChromeScrollLock({
      isActive: () => Date.now() < chromeLockUntilRef.current,
      restore,
    }).cancel;
  };

  const runWithComposerChromeScrollGuard = (action: () => void) => {
    beginComposerChromeScrollLock();
    runPreservingChatScroll(messagesRef.current, action);
    // Extend the same lock (do not re-snapshot — React/menu may have yanked).
    beginComposerChromeScrollLock();
  };

  // Open / ready / thread: force stick and keep pinning until layout settles.
  // Parked fibers must NOT keep mid scrollTop — that is the host-switch mid bug.
  useLayoutEffect(() => {
    if (!shouldForceStickOnChatOpen({ open, findOpen, ready })) return;
    stickToBottomRef.current = true;
    openFollowUntilRef.current = Date.now() + OPEN_CHAT_FOLLOW_MS;
    const handle = scheduleOpenChatPin({
      pin: pinChatToBottom,
      isNearBottom: () => {
        const scroller = messagesRef.current;
        return scroller ? isChatNearBottom(scroller) : false;
      },
      isGeometryReady: () => {
        const scroller = messagesRef.current;
        return scroller ? isChatScrollGeometryReady(scroller) : false;
      },
      maxFrames: 48,
    });
    // Late markdown/hydrate after first paint + mid-window catch-up.
    const t1 = window.setTimeout(() => {
      if (stickToBottomRef.current) pinChatToBottom();
    }, 120);
    const t2 = window.setTimeout(() => {
      if (Date.now() <= openFollowUntilRef.current && stickToBottomRef.current) {
        pinChatToBottom();
      }
    }, 600);
    const t3 = window.setTimeout(() => {
      if (Date.now() <= openFollowUntilRef.current && stickToBottomRef.current) {
        pinChatToBottom();
      }
    }, 1400);
    return () => {
      handle.cancel();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, findOpen, ready, activeThreadId, sessionId]);

  // Soft-hide / host switch: pin parked fiber to bottom so reopen never
  // inherits a mid scrollTop (visibility/opacity unpark cannot restore mid).
  useLayoutEffect(() => {
    if (!shouldParkChatScrollerAtBottom({ open, ready })) return;
    stickToBottomRef.current = true;
    pinChatToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready, sessionId, messages.length]);

  // Message list grew during open-follow (disk hydrate / resume marker) → re-pin.
  useLayoutEffect(() => {
    if (!open || !ready) return;
    if (Date.now() > openFollowUntilRef.current) return;
    stickToBottomRef.current = true;
    pinChatToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, open, ready]);

  // Stream tokens / tool chunks: pin in useLayoutEffect (before paint).
  // ResizeObserver alone runs after paint → one frame of 往上跳 per token.
  const streamPinKey = useMemo(() => streamFollowPinKey(messages), [messages]);
  const hasStreamingAssistant = useMemo(
    () =>
      messages.some(
        (m) => m.kind === "assistant" && Boolean(m.streaming),
      ),
    [messages],
  );
  useLayoutEffect(() => {
    if (!open || !ready) return;
    const forceFollow = shouldForceChatFollow({
      busy: busy || hasStreamingAssistant,
      userReleasedFollow: userReleasedFollowRef.current,
      withinSettleFollowWindow: Date.now() < settleFollowUntilRef.current,
    });
    // Rapid tool loops + post-run image settle: keep pinning unless user wheeled away.
    if (forceFollow) {
      stickToBottomRef.current = true;
      rememberedNearBottomRef.current = true;
      pinChatToBottom();
      return;
    }
    const follow = shouldFollowChatTranscript({
      stickToBottom: stickToBottomRef.current,
      rememberedNearBottom: rememberedNearBottomRef.current,
      withinOpenFollowWindow: Date.now() < openFollowUntilRef.current,
      withinSettleFollowWindow: Date.now() < settleFollowUntilRef.current,
      forceFollow,
    });
    if (
      !shouldPinChatOnStreamUpdate({
        stickToBottom: stickToBottomRef.current,
        rememberedNearBottom: rememberedNearBottomRef.current,
        withinOpenFollowWindow: Date.now() < openFollowUntilRef.current,
        withinSettleFollowWindow: Date.now() < settleFollowUntilRef.current,
        forceFollow,
      })
    ) {
      return;
    }
    // Chrome lock holding a mid snapshot must not fight stream follow.
    if (Date.now() < chromeLockUntilRef.current && !follow) {
      return;
    }
    pinChatToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamPinKey, open, ready, busy, hasStreamingAssistant]);

  // New agent run: re-enable auto-follow. Run end: settle window for late images.
  useEffect(() => {
    if (busy || hasStreamingAssistant) {
      userReleasedFollowRef.current = false;
      if (busy) settleFollowUntilRef.current = 0;
      stickToBottomRef.current = true;
      rememberedNearBottomRef.current = true;
      return;
    }
    if (userReleasedFollowRef.current) return;
    settleFollowUntilRef.current = Date.now() + RUN_SETTLE_FOLLOW_MS;
    stickToBottomRef.current = true;
    rememberedNearBottomRef.current = true;
    pinChatToBottom();
    const t1 = window.setTimeout(() => {
      if (
        !userReleasedFollowRef.current &&
        Date.now() <= settleFollowUntilRef.current
      ) {
        pinChatToBottom();
      }
    }, 400);
    const t2 = window.setTimeout(() => {
      if (
        !userReleasedFollowRef.current &&
        Date.now() <= settleFollowUntilRef.current
      ) {
        pinChatToBottom();
      }
    }, 1600);
    const t3 = window.setTimeout(() => {
      if (
        !userReleasedFollowRef.current &&
        Date.now() <= settleFollowUntilRef.current
      ) {
        pinChatToBottom();
      }
    }, 3200);
    const t4 = window.setTimeout(() => {
      if (
        !userReleasedFollowRef.current &&
        Date.now() <= settleFollowUntilRef.current
      ) {
        pinChatToBottom();
      }
    }, 6000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, hasStreamingAssistant]);

  // Stick: wheel/touch clear immediately; scroll updates proximity outside pin ignore.
  // While force-follow, ignore proximity rewrites (late markdown must not kill follow).
  busyFollowRef.current = busy || hasStreamingAssistant;
  useEffect(() => {
    if (!open || !ready) return;
    const el = messagesRef.current;
    if (!el) return;
    const clearStickFromIntent = (deltaY?: number) => {
      if (
        !shouldClearStickOnUserIntent({
          deltaY,
          forceFollow: isForceChatFollow(),
        })
      ) {
        return;
      }
      openFollowUntilRef.current = 0;
      settleFollowUntilRef.current = 0;
      chromeLockUntilRef.current = 0;
      chromeLockCancelRef.current?.();
      chromeLockCancelRef.current = null;
      stickToBottomRef.current = false;
      rememberedNearBottomRef.current = false;
      userReleasedFollowRef.current = true;
      freezeScrollTopRef.current = el.scrollTop;
    };
    const onWheel = (event: WheelEvent) => {
      clearStickFromIntent(event.deltaY);
    };
    const onTouchMove = () => {
      // Touch has no deltaY here — treat as intentional while not force-following;
      // while force-following require a second deliberate gesture via scroll distance.
      if (isForceChatFollow()) return;
      clearStickFromIntent(48);
    };
    const onScroll = () => {
      if (
        shouldHoldChatScrollForComposerChrome({
          withinChromeScrollLock: Date.now() < chromeLockUntilRef.current,
        })
      ) {
        if (
          shouldPinDuringComposerChromeLock({
            stickToBottom: stickToBottomRef.current,
            rememberedNearBottom: rememberedNearBottomRef.current,
            forceFollow: isForceChatFollow(),
          })
        ) {
          scrollChatToBottom(el);
          stickToBottomRef.current = true;
          rememberedNearBottomRef.current = true;
        } else if (Math.abs(el.scrollTop - chromeLockTopRef.current) > 1) {
          el.scrollTop = chromeLockTopRef.current;
        }
        return;
      }
      if (
        shouldHoldStickWhileForcedFollow({
          forceFollow: isForceChatFollow(),
        }) ||
        shouldHoldStickWhileBusyFollow({
          busy: busyFollowRef.current,
          stickToBottom: stickToBottomRef.current,
          rememberedNearBottom: rememberedNearBottomRef.current,
        })
      ) {
        stickToBottomRef.current = true;
        rememberedNearBottomRef.current = true;
        if (!isChatNearBottom(el, 200)) pinChatToBottom();
        return;
      }
      if (
        !shouldUpdateStickFromScrollEvent({
          withinProgrammaticPinIgnore:
            Date.now() < ignoreScrollUntilRef.current,
          withinOpenFollowWindow: Date.now() < openFollowUntilRef.current,
        })
      ) {
        return;
      }
      const near = isChatNearBottom(el);
      stickToBottomRef.current = near;
      // Maximize/WK may yank scrollTop before resize fires — never clear
      // rememberedNearBottom from scroll proximity alone (wheel/touch does).
      if (near) {
        rememberedNearBottomRef.current = true;
      } else {
        freezeScrollTopRef.current = el.scrollTop;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("scroll", onScroll);
    };
  }, [open, ready, sessionId]);

  // Content height via ResizeObserver (markdown / tool expand).
  // Follow = stick OR remembered near-bottom OR open-follow OR settle. Mid-read writes nothing.
  useEffect(() => {
    if (!open || !ready) return;
    const el = messagesRef.current;
    const inner = messagesInnerRef.current;
    if (!el || !inner || typeof ResizeObserver === "undefined") return;
    let lastHeight = inner.scrollHeight;
    const ro = new ResizeObserver(() => {
      if (
        shouldDeferResizeScrollDuringComposerChrome({
          withinChromeScrollLock: Date.now() < chromeLockUntilRef.current,
        })
      ) {
        if (
          shouldPinDuringComposerChromeLock({
            stickToBottom: stickToBottomRef.current,
            rememberedNearBottom: rememberedNearBottomRef.current,
            forceFollow: isForceChatFollow(),
          })
        ) {
          pinChatToBottom();
        } else if (
          Math.abs(el.scrollTop - chromeLockTopRef.current) > 1
        ) {
          el.scrollTop = chromeLockTopRef.current;
        }
        lastHeight = inner.scrollHeight;
        return;
      }
      if (isForceChatFollow()) {
        stickToBottomRef.current = true;
        rememberedNearBottomRef.current = true;
        lastHeight = inner.scrollHeight;
        pinChatToBottom();
        return;
      }
      const nextHeight = inner.scrollHeight;
      const follow = shouldFollowChatTranscript({
        stickToBottom: stickToBottomRef.current,
        rememberedNearBottom: rememberedNearBottomRef.current,
        withinOpenFollowWindow: Date.now() < openFollowUntilRef.current,
        withinSettleFollowWindow: Date.now() < settleFollowUntilRef.current,
      });
      if (follow) stickToBottomRef.current = true;
      const decision = scrollTopAfterContentHeightChange({
        stickToBottom: follow,
        previousScrollTop: el.scrollTop,
        previousHeight: lastHeight,
        nextHeight,
        clientHeight: el.clientHeight,
      });
      lastHeight = nextHeight;
      if (decision.action === "pin") {
        pinChatToBottom();
      }
    });
    ro.observe(inner);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready, sessionId]);

  // Viewport / maximize: pin if following (stick OR remembered near-bottom).
  // Never re-read "near bottom" after WK may already have yanked scrollTop.
  // ResizeObserver alone is unreliable on Tauri maximize — also listen window + onResized.
  useEffect(() => {
    if (!open || !ready) return;
    const el = messagesRef.current;
    if (!el) return;
    let lastClientHeight = el.clientHeight;
    let pinTimers: number[] = [];

    const applyViewportResize = (force: boolean) => {
      const scroller = messagesRef.current;
      if (!scroller) return;
      if (
        shouldDeferResizeScrollDuringComposerChrome({
          withinChromeScrollLock: Date.now() < chromeLockUntilRef.current,
        })
      ) {
        if (
          shouldPinDuringComposerChromeLock({
            stickToBottom: stickToBottomRef.current,
            rememberedNearBottom: rememberedNearBottomRef.current,
            forceFollow: isForceChatFollow(),
          })
        ) {
          pinChatToBottom();
        } else if (
          Math.abs(scroller.scrollTop - chromeLockTopRef.current) > 1
        ) {
          scroller.scrollTop = chromeLockTopRef.current;
        }
        lastClientHeight = scroller.clientHeight;
        return;
      }
      // Ignore scroll proximity rewrites while we fight the native yank.
      ignoreScrollUntilRef.current = Date.now() + 400;
      const nextClientHeight = scroller.clientHeight;
      const forceFollow = isForceChatFollow();
      const follow =
        forceFollow ||
        shouldFollowChatOnViewportResize({
          stickToBottom: stickToBottomRef.current,
          rememberedNearBottom: rememberedNearBottomRef.current,
        });
      const decision = scrollTopAfterViewportResize({
        stickToBottom: follow,
        wasNearBottom: follow,
        previousScrollTop: follow
          ? scroller.scrollTop
          : freezeScrollTopRef.current,
        previousClientHeight: lastClientHeight,
        nextClientHeight,
        scrollHeight: scroller.scrollHeight,
        force,
        busy: forceFollow || busyFollowRef.current,
      });
      lastClientHeight = nextClientHeight;
      if (decision.action === "pin") {
        stickToBottomRef.current = true;
        rememberedNearBottomRef.current = true;
        pinChatToBottom();
        // Fight async WKWebView scroll restore after native maximize.
        requestAnimationFrame(() => {
          if (stickToBottomRef.current) pinChatToBottom();
          requestAnimationFrame(() => {
            if (stickToBottomRef.current) pinChatToBottom();
          });
        });
        for (const ms of [50, 160, 320]) {
          pinTimers.push(
            window.setTimeout(() => {
              if (stickToBottomRef.current) pinChatToBottom();
            }, ms),
          );
        }
        return;
      }
      if (decision.action === "freeze") {
        if (Math.abs(scroller.scrollTop - decision.scrollTop) > 1) {
          scroller.scrollTop = decision.scrollTop;
        }
      }
    };

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => applyViewportResize(false));
      ro.observe(el);
      const panel = el.closest(".ai-engineer-panel");
      if (panel) ro.observe(panel);
    }

    const onWindowResize = () => applyViewportResize(true);
    window.addEventListener("resize", onWindowResize);

    let unlistenResized: (() => void) | undefined;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        unlistenResized = await getCurrentWindow().onResized(() => {
          applyViewportResize(true);
        });
      } catch {
        // browser E2E / non-Tauri
      }
    })();

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", onWindowResize);
      unlistenResized?.();
      for (const t of pinTimers) window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready, sessionId]);

  const busyPhase = useMemo(
    () =>
      resolveBusyPhase({
        busy,
        pendingApproval: Boolean(pendingApproval),
        sudoPromptOpen,
        awaitingApprovedExec: isAwaitingApprovedExec(messages),
        modelPhase,
        tools: messages
          .filter((m): m is ToolLine => m.kind === "tool")
          .map((m) => ({
            kind: "tool" as const,
            name: m.name,
            status: m.status,
            intent: m.intent,
            detail: m.detail,
          })),
      }),
    [busy, pendingApproval, sudoPromptOpen, modelPhase, messages],
  );

  const [awaitingExecSince, setAwaitingExecSince] = useState<number | null>(
    null,
  );
  const [awaitingClock, setAwaitingClock] = useState(() => Date.now());
  useEffect(() => {
    if (busyPhase.kind === "awaiting_exec") {
      setAwaitingExecSince((prev) => prev ?? Date.now());
      return;
    }
    setAwaitingExecSince(null);
  }, [busyPhase.kind]);
  useEffect(() => {
    if (busyPhase.kind !== "awaiting_exec") return;
    const id = window.setInterval(() => setAwaitingClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [busyPhase.kind]);
  const awaitingExecStuck = isAwaitingApprovedExecStuck(
    awaitingExecSince,
    awaitingClock,
  );

  const liveToolKey = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.kind === "tool" && m.status === "running") {
        return m.callId || m.id;
      }
    }
    return null;
  }, [messages]);

  const hasLiveTool = liveToolKey != null;

  const busyLabel =
    busyPhase.kind === "approval"
      ? t("aiEngineer.waitingApprovalBusy")
      : busyPhase.kind === "sudo"
        ? t("aiEngineer.waitingSudoBusy")
        : busyPhase.kind === "awaiting_exec"
          ? awaitingExecStuck
            ? t("aiEngineer.awaitingApprovedExecStuck")
            : t("aiEngineer.awaitingApprovedExec")
          : busyPhase.kind === "host_exec"
            ? t("aiEngineer.hostExecuting", { title: busyPhase.title })
            : busyPhase.kind === "thinking" && busyPhase.streamingThought
              ? agentRuntime === "cursor"
                ? t("aiEngineer.cursorRunning")
                : agentRuntime === "codex"
                  ? t("aiEngineer.codexRunning")
                  : agentRuntime === "claude"
                    ? t("aiEngineer.claudeRunning")
                    : t("aiEngineer.modelThinking")
              : agentRuntime === "cursor"
                ? t("aiEngineer.cursorRunning")
                : agentRuntime === "codex"
                  ? t("aiEngineer.codexRunning")
                  : agentRuntime === "claude"
                    ? t("aiEngineer.claudeRunning")
                    : t("aiEngineer.running");

  const submit = () => {
    if (busy) return;
    if (
      agentRuntime === "cursor" ||
      agentRuntime === "codex" ||
      agentRuntime === "claude"
    ) {
      const status = externalRuntimeStatusKind(runtimeProbe, agentRuntime);
      if (status === "install_needed" || status === "unknown") {
        void refreshRuntimeProbe(agentRuntime).then((p) => {
          const next = externalRuntimeStatusKind(p, agentRuntime);
          if (next === "install_needed" || next === "not_ready" || next === "unknown") {
            setModelOpen(true);
            return;
          }
          stickToBottomRef.current = true;
          void sendMessage({
            sessionId,
            serverId,
            clusterId: clusterId ?? undefined,
          });
        });
        return;
      }
    }
    stickToBottomRef.current = true;
    void sendMessage({
      sessionId,
      serverId,
      clusterId: clusterId ?? undefined,
    });
  };

  const refreshRuntimeProbe = async (kind: AgentRuntimeKind) => {
    if (kind === "builtin") {
      setRuntimeProbe(null);
      return null;
    }
    setRuntimeProbing(true);
    try {
      const info = await ensureSidecar();
      const result = await probeRuntime(info, kind);
      setRuntimeProbe(result);
      return result;
    } catch {
      setRuntimeProbe({
        kind,
        installed: false,
        authenticated: false,
        detail: "probe_failed",
        fake: false,
        code: "install_needed",
      });
      return null;
    } finally {
      setRuntimeProbing(false);
    }
  };

  const selectExternalRuntime = (kind: AgentRuntimeKind) => {
    runWithComposerChromeScrollGuard(() => {
      setModelOpen(kind === "builtin" ? false : true);
    });
    setAgentRuntime(kind);
    if (kind !== "builtin") {
      void refreshRuntimeProbe(kind);
    } else {
      setRuntimeProbe(null);
      setModelOpen(false);
    }
  };

  const requestSaveAsSkill = () => {
    if (busy || !ready || !canChat) return;
    setComposerInput(t("aiEngineer.saveAsSkillPrompt"));
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

  // Keep the transcript DOM mounted while soft-hidden (host-tab switch sets
  // open=false). Returning null remounts markdown and makes chat text flash.
  return (
    <>
      {open ? (
        <WorkspacePanelBackdrop
          panelId="aiEngineer"
          dismissible={!busy && !settingsOpen}
        />
      ) : null}
      <aside
        ref={panelRef}
        className={`ai-engineer-panel find-panel${open ? "" : " ai-engineer-panel-parked"}`}
        style={{ width }}
        aria-label={panelTitle}
        aria-hidden={!open}
        inert={!open ? true : undefined}
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
            let latest = startW;
            const shell = document.querySelector(".app-shell") as HTMLElement | null;
            document.body.classList.add("find-panel-resizing");
            const onMove = (ev: MouseEvent) => {
              latest = clampWorkspacePanelWidth(startW - (ev.clientX - startX));
              // Live DOM/CSS only — commit store width on mouseup to avoid chat re-render jank.
              if (panelRef.current) panelRef.current.style.width = `${latest}px`;
              shell?.style.setProperty("--workspace-panel-width", `${latest}px`);
            };
            const onUp = () => {
              document.body.classList.remove("find-panel-resizing");
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
              setWidth(latest);
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
              className={`ai-engineer-icon-btn${findOpen ? " is-active" : ""}`}
              onClick={() => {
                setFindOpen((v) => !v);
                setOutlineOpen(false);
                setHistoryOpen(false);
                setSkillsOpen(false);
                setMemoryOpen(false);
              }}
              aria-label={t("aiEngineer.findChat")}
              title={t("aiEngineer.findChat")}
              data-testid="ai-engineer-find-toggle"
            >
              <Search size={16} strokeWidth={2} aria-hidden />
            </button>
            <div className="ai-engineer-menu-wrap">
              <button
                type="button"
                className={`ai-engineer-icon-btn${outlineOpen ? " is-active" : ""}`}
                aria-expanded={outlineOpen}
                aria-label={t("aiEngineer.outline")}
                title={`${t("aiEngineer.outline")} (${t("aiEngineer.outlineHint")})`}
                data-testid="ai-engineer-outline-toggle"
                onClick={() => {
                  setOutlineOpen((v) => !v);
                  setFindOpen(false);
                  setHistoryOpen(false);
                  setSkillsOpen(false);
                  setMemoryOpen(false);
                  setModelOpen(false);
                }}
              >
                <ListTree size={16} strokeWidth={2} aria-hidden />
              </button>
              {outlineOpen ? (
                <div
                  className="ai-engineer-menu ai-engineer-outline-menu"
                  role="menu"
                  data-testid="ai-engineer-outline-menu"
                >
                  {chatOutline.length === 0 ? (
                    <div className="ai-engineer-menu-empty">
                      {t("aiEngineer.outlineEmpty")}
                    </div>
                  ) : (
                    chatOutline.map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        className={`ai-engineer-menu-item${
                          node.id === activeOutlineId ? " active" : ""
                        }`}
                        role="menuitem"
                        onClick={() => {
                          scrollToChatNode(node.id);
                          setOutlineOpen(false);
                        }}
                      >
                        <span className="ai-engineer-outline-label">
                          {node.kind === "user"
                            ? t("aiEngineer.outlineUser", { n: node.ordinal })
                            : t("aiEngineer.outlineAssistant", {
                                n: node.ordinal,
                              })}
                        </span>
                        <span className="ai-engineer-outline-preview">
                          {node.preview}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
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
                  setSkillsOpen(false);
                  setMemoryOpen(false);
                  setOutlineOpen(false);
                  setFindOpen(false);
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
            <div className="ai-engineer-menu-wrap">
              <button
                type="button"
                className={`ai-engineer-icon-btn${skillsOpen ? " is-active" : ""}`}
                aria-expanded={skillsOpen}
                aria-label={t("aiEngineer.skills")}
                title={t("aiEngineer.skills")}
                data-testid="ai-engineer-skills-toggle"
                onClick={() => {
                  const next = !skillsOpen;
                  setSkillsOpen(next);
                  setMemoryOpen(false);
                  setFindOpen(false);
                  setOutlineOpen(false);
                  setHistoryOpen(false);
                  setModelOpen(false);
                  if (next) void loadSkillsCatalog();
                }}
              >
                <BookMarked size={16} strokeWidth={2} aria-hidden />
              </button>
              {skillsOpen ? (
                <div
                  className="ai-engineer-menu ai-engineer-skills-menu"
                  role="menu"
                  data-testid="ai-engineer-skills-menu"
                >
                  <div className="ai-engineer-skills-menu-head">
                    {t("aiEngineer.skillsCount", {
                      count: skillsCatalog?.count ?? 0,
                    })}
                  </div>
                  {skillsLoading ? (
                    <div className="ai-engineer-menu-empty">
                      {t("aiEngineer.skillsLoading")}
                    </div>
                  ) : skillsError ? (
                    <div className="ai-engineer-menu-empty">{skillsError}</div>
                  ) : !skillsCatalog || skillsCatalog.skills.length === 0 ? (
                    <div className="ai-engineer-menu-empty">
                      {t("aiEngineer.skillsEmpty")}
                    </div>
                  ) : (
                    <div className="ai-engineer-skills-list">
                      {skillsCatalog.skills.map((skill) => (
                        <button
                          key={skill.id}
                          type="button"
                          className="ai-engineer-menu-item ai-engineer-catalog-row"
                          role="menuitem"
                          title={skill.path}
                          onClick={() => {
                            void revealLocalPath(skill.path)
                              .then(() => setSkillsOpen(false))
                              .catch((err) =>
                                useToastStore
                                  .getState()
                                  .pushToast(formatAppError(err), false),
                              );
                          }}
                        >
                          <span className="ai-engineer-catalog-title">
                            {skill.title}
                          </span>
                          <span className="ai-engineer-catalog-sub">{skill.id}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    className="ai-engineer-menu-item ai-engineer-skills-open-folder"
                    role="menuitem"
                    data-testid="ai-engineer-skills-open-folder"
                    disabled={!skillsCatalog?.root}
                    onClick={() => {
                      const root = skillsCatalog?.root;
                      if (!root) return;
                      void revealLocalPath(root)
                        .then(() => setSkillsOpen(false))
                        .catch((err) =>
                          useToastStore
                            .getState()
                            .pushToast(formatAppError(err), false),
                        );
                    }}
                  >
                    {t("aiEngineer.skillsOpenFolder")}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="ai-engineer-menu-wrap">
              <button
                type="button"
                className={`ai-engineer-icon-btn${memoryOpen ? " is-active" : ""}`}
                aria-expanded={memoryOpen}
                aria-label={t("aiEngineer.memory")}
                title={t("aiEngineer.memory")}
                data-testid="ai-engineer-memory-toggle"
                onClick={() => {
                  const next = !memoryOpen;
                  setMemoryOpen(next);
                  setSkillsOpen(false);
                  setFindOpen(false);
                  setOutlineOpen(false);
                  setHistoryOpen(false);
                  setModelOpen(false);
                  if (next) void loadMemoryCatalog();
                }}
              >
                <Brain size={16} strokeWidth={2} aria-hidden />
              </button>
              {memoryOpen ? (
                <div
                  className="ai-engineer-menu ai-engineer-skills-menu ai-engineer-memory-menu"
                  role="menu"
                  data-testid="ai-engineer-memory-menu"
                >
                  <div className="ai-engineer-skills-menu-head">
                    {t("aiEngineer.memoryTitle")}
                  </div>
                  {memoryLoading ? (
                    <div className="ai-engineer-menu-empty">
                      {t("aiEngineer.memoryLoading")}
                    </div>
                  ) : memoryError ? (
                    <div className="ai-engineer-menu-empty">{memoryError}</div>
                  ) : (
                    <>
                      <div
                        className="ai-engineer-memory-section-label"
                        data-testid="ai-engineer-memory-section-user"
                      >
                        {t("aiEngineer.memorySectionUser")}
                      </div>
                      <button
                        type="button"
                        className="ai-engineer-menu-item ai-engineer-catalog-row"
                        role="menuitem"
                        title={memoryCatalog?.user_path}
                        disabled={!memoryCatalog?.user_path}
                        onClick={() => {
                          const p = memoryCatalog?.user_path;
                          if (!p) return;
                          void revealLocalPath(p)
                            .then(() => setMemoryOpen(false))
                            .catch((err) =>
                              useToastStore
                                .getState()
                                .pushToast(formatAppError(err), false),
                            );
                        }}
                      >
                        <span className="ai-engineer-catalog-title">
                          {engineerMode === "k8s"
                            ? t("aiEngineer.memoryUserK8s")
                            : t("aiEngineer.memoryUser")}
                        </span>
                        <span className="ai-engineer-catalog-sub">
                          {t("aiEngineer.memoryUserCounts", {
                            prefs: memoryCatalog?.user.prefs ?? 0,
                            notes: memoryCatalog?.user.notes ?? 0,
                          })}
                        </span>
                      </button>
                      <div
                        className="ai-engineer-memory-section-label"
                        data-testid="ai-engineer-memory-section-targets"
                      >
                        {engineerMode === "k8s"
                          ? t("aiEngineer.memorySectionClusters")
                          : t("aiEngineer.memorySectionHosts")}
                      </div>
                      {(memoryCatalog?.hosts ?? []).length === 0 ? (
                        <div className="ai-engineer-menu-empty">
                          {engineerMode === "k8s"
                            ? t("aiEngineer.memoryClustersEmpty")
                            : t("aiEngineer.memoryHostsEmpty")}
                        </div>
                      ) : (
                        <div className="ai-engineer-skills-list">
                          {memoryCatalog!.hosts.map((host) => (
                            <button
                              key={host.scope}
                              type="button"
                              className="ai-engineer-menu-item ai-engineer-catalog-row"
                              role="menuitem"
                              title={host.path}
                              onClick={() => {
                                void revealLocalPath(host.path)
                                  .then(() => setMemoryOpen(false))
                                  .catch((err) =>
                                    useToastStore
                                      .getState()
                                      .pushToast(formatAppError(err), false),
                                  );
                              }}
                            >
                              <span className="ai-engineer-catalog-title">
                                {host.scope}
                              </span>
                              <span className="ai-engineer-catalog-sub">
                                {t("aiEngineer.memoryCounts", {
                                  prefs: host.prefs,
                                  facts: host.facts,
                                  notes: host.notes,
                                })}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    className="ai-engineer-menu-item ai-engineer-skills-open-folder"
                    role="menuitem"
                    data-testid="ai-engineer-memory-open-folder"
                    disabled={!memoryCatalog?.memory_dir && !memoryCatalog?.hosts_dir}
                    onClick={() => {
                      const root =
                        memoryCatalog?.memory_dir || memoryCatalog?.hosts_dir;
                      if (!root) return;
                      void revealLocalPath(root)
                        .then(() => setMemoryOpen(false))
                        .catch((err) =>
                          useToastStore
                            .getState()
                            .pushToast(formatAppError(err), false),
                        );
                    }}
                  >
                    {t("aiEngineer.memoryOpenFolder")}
                  </button>
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
        {findOpen ? (
          <div className="ai-engineer-find-bar" data-testid="ai-engineer-find-bar">
            <input
              type="search"
              className="ai-engineer-find-input"
              data-testid="ai-engineer-find-input"
              placeholder={t("aiEngineer.findPlaceholder")}
              value={findQuery}
              autoFocus
              onChange={(e) => setFindQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setFindOpen(false);
                  return;
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  setFindMatchIndex((cur) =>
                    stepMatchIndex(
                      cur,
                      findMatches.length,
                      e.shiftKey ? -1 : 1,
                    ),
                  );
                }
              }}
            />
            <span className="ai-engineer-find-count" data-testid="ai-engineer-find-count">
              {findMatches.length === 0
                ? t("aiEngineer.findNone")
                : t("aiEngineer.findCount", {
                    current: Math.min(findMatchIndex, findMatches.length - 1) + 1,
                    total: findMatches.length,
                  })}
            </span>
            <button
              type="button"
              className="ai-engineer-icon-btn"
              data-testid="ai-engineer-find-prev"
              aria-label={t("aiEngineer.findPrev")}
              disabled={findMatches.length === 0}
              onClick={() =>
                setFindMatchIndex((cur) =>
                  stepMatchIndex(cur, findMatches.length, -1),
                )
              }
            >
              ↑
            </button>
            <button
              type="button"
              className="ai-engineer-icon-btn"
              data-testid="ai-engineer-find-next"
              aria-label={t("aiEngineer.findNext")}
              disabled={findMatches.length === 0}
              onClick={() =>
                setFindMatchIndex((cur) =>
                  stepMatchIndex(cur, findMatches.length, 1),
                )
              }
            >
              ↓
            </button>
            <button
              type="button"
              className="ai-engineer-icon-btn"
              data-testid="ai-engineer-find-close"
              aria-label={t("aiEngineer.findClose")}
              onClick={() => setFindOpen(false)}
            >
              ×
            </button>
          </div>
        ) : null}
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
              <div
                className="ai-engineer-messages"
                ref={messagesRef}
                tabIndex={-1}
              >
                <div
                  className="ai-engineer-messages-inner"
                  ref={messagesInnerRef}
                >
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
                {!canChat ? (
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
                      onClick={() => openSettings()}
                    >
                      {t("aiEngineer.configureModelAction")}
                    </button>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="ai-engineer-empty">
                    <p className="find-panel-empty">{emptyHint}</p>
                    <div className="ai-engineer-workflow-chips" role="group">
                      {(engineerMode === "k8s"
                        ? K8S_WORKFLOW_CHIP_IDS
                        : WORKFLOW_CHIP_IDS
                      ).map((id) => (
                        <button
                          key={id}
                          type="button"
                          className="ai-engineer-workflow-chip"
                          disabled={!ready || !canChat}
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
                    // Never ask the user to type 「继续」— sidecar auto-continues.
                    if (
                      line.content === "assistant_incomplete" ||
                      line.content === "assistant_soft_continue"
                    ) {
                      return null;
                    }
                    const text =
                      line.variant === "compaction"
                        ? t("aiEngineer.noticeCompaction")
                        : line.variant === "resumed"
                          ? t("aiEngineer.noticeResumed")
                          : line.variant === "harness"
                            ? t(`aiEngineer.notice.${line.content}` as
                                | "aiEngineer.notice.evidence_nudge"
                                | "aiEngineer.notice.evidence_nudge_blocked"
                                | "aiEngineer.notice.act_nudge"
                                | "aiEngineer.notice.act_nudge_plan"
                                | "aiEngineer.notice.act_nudge_truncated_answer"
                                | "aiEngineer.notice.act_nudge_conclude"
                                | "aiEngineer.notice.verify_nudge"
                                | "aiEngineer.notice.audit_nudge"
                                | "aiEngineer.notice.resume_miss"
                                | "aiEngineer.notice.run_stalled")
                            : line.content === "memory_context"
                              ? t("aiEngineer.noticeMemoryContext")
                              : line.content.startsWith("[USER CONTEXT]")
                                ? t("aiEngineer.noticeUserContext")
                                : line.content;
                    return (
                      <div
                        key={rowKey}
                        className={`ai-engineer-notice ai-engineer-notice-${line.variant}`}
                        data-chat-node-id={line.id}
                        data-testid={
                          line.variant === "harness"
                            ? "ai-engineer-harness-notice"
                            : undefined
                        }
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
                  if (line.kind === "external_activity") {
                    const status =
                      line.ok === false
                        ? t("aiEngineer.toolFailed")
                        : line.ok === true
                          ? t("aiEngineer.toolDone")
                          : "";
                    return (
                      <div
                        key={rowKey}
                        className="ai-engineer-external-activity"
                        data-testid="ai-engineer-external-activity"
                      >
                        <div className="ai-engineer-external-activity-head">
                          <span className="ai-engineer-external-activity-runtime">
                            {line.runtime === "cursor"
                              ? t("aiEngineer.runtime.cursor")
                              : line.runtime === "codex"
                                ? t("aiEngineer.runtime.codex")
                                : t("aiEngineer.runtime.external")}
                          </span>
                          <span className="ai-engineer-external-activity-name">
                            {line.name}
                          </span>
                          {status ? (
                            <span className="ai-engineer-external-activity-status">
                              {status}
                            </span>
                          ) : null}
                        </div>
                        {line.detail ? (
                          <pre className="ai-engineer-external-activity-detail">
                            {line.detail}
                          </pre>
                        ) : null}
                      </div>
                    );
                  }
                  if (line.kind === "tool") {
                    const key = line.callId || line.id;
                    const live = hasLiveTool && key === liveToolKey;
                    const badge = approvalBadgeForTool(line, messages);
                    return (
                      <ToolExecCard
                        key={rowKey}
                        line={line}
                        t={t}
                        live={live}
                        dimmed={hasLiveTool && !live}
                        risk={badge.risk}
                        approved={badge.approved}
                      />
                    );
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
                    // After approve, the exec card owns the command + risk —
                    // do not keep a second "批准·已批准" block above it.
                    if (shouldOmitResolvedApprovalCard(line, messages)) {
                      return null;
                    }
                    const displayCommand = sanitizeDisplayCommand(line.command);
                    const approvalTitle = (
                      line.intent ||
                      extractCommandTitle(line.command) ||
                      displayCommand.split("\n")[0] ||
                      t("aiEngineer.approvalTitle")
                    ).trim();
                    const approvalTools = summarizeShellTools(displayCommand);
                    const approvalToolsLabel =
                      approvalTools.length > 0
                        ? `${approvalTools.slice(0, 5).join(", ")}${
                            approvalTools.length > 5 ? " …" : ""
                          }`
                        : "";
                    return (
                      <div
                        key={rowKey}
                        className={`ai-engineer-exec-card is-expanded is-approval${
                          line.decision ? " is-resolved" : ""
                        }${hasLiveTool && !isActive ? " is-dimmed" : ""}`}
                        data-testid="ai-engineer-approval-card"
                        data-ai-exec="1"
                        data-ai-approval="1"
                      >
                        <div className="ai-engineer-exec-head">
                          <span className="ai-engineer-exec-glyph" aria-hidden>
                            <TerminalGlyph mode="prompt" />
                          </span>
                          <span
                            className="ai-engineer-exec-title"
                            title={approvalTitle}
                          >
                            {approvalTitle}
                          </span>
                          {line.decision === "approved" ? (
                            <span
                              className="ai-engineer-exec-approved"
                              data-testid="ai-engineer-exec-approved"
                            >
                              {t("aiEngineer.approved")}
                            </span>
                          ) : null}
                          {line.decision === "rejected" ? (
                            <span className="ai-engineer-exec-status is-denied">
                              {t("aiEngineer.rejected")}
                            </span>
                          ) : null}
                          <span
                            className="ai-engineer-exec-risk"
                            title={line.risk}
                            data-testid="ai-engineer-exec-risk"
                          >
                            {t(riskLabelKey(line.risk))}
                          </span>
                          {approvalToolsLabel ? (
                            <span className="ai-engineer-exec-tools" aria-hidden>
                              {approvalToolsLabel}
                            </span>
                          ) : null}
                        </div>
                        <div className="ai-engineer-exec-body">
                          {line.intent &&
                          line.intent.trim() !== approvalTitle ? (
                            <p className="ai-engineer-approval-intent">
                              {line.intent}
                            </p>
                          ) : null}
                          <div
                            className="ai-engineer-exec-command"
                            data-testid="ai-engineer-approval-command"
                          >
                            <span
                              className="ai-engineer-exec-prompt"
                              aria-hidden
                            >
                              $
                            </span>
                            <code className="ai-engineer-exec-command-code">
                              {highlightShell(displayCommand)}
                            </code>
                          </div>
                          {line.execCommand &&
                          line.execCommand !== line.command ? (
                            <p className="ai-engineer-approval-reason">
                              {t("aiEngineer.execWrapped")}
                              <code className="ai-engineer-tool-detail">
                                {line.execCommand}
                              </code>
                            </p>
                          ) : null}
                          <p className="ai-engineer-approval-reason is-policy">
                            {t(riskDescKey(line.risk))}
                          </p>
                          {line.impactPreview ? (
                            <pre className="ai-engineer-impact-preview">
                              {line.impactPreview}
                            </pre>
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
                                onChange={(e) =>
                                  setConfirmDraft(e.target.value)
                                }
                                placeholder={phrase}
                                disabled={!isActive}
                              />
                            </label>
                          ) : null}
                          {line.decision ? null : (
                            <div className="ai-engineer-approval-footer">
                              <div className="ai-engineer-approval-footer-opts">
                                {isActive &&
                                line.rememberableBinaries &&
                                line.rememberableBinaries.length > 0 ? (
                                  <label className="ai-engineer-remember-read">
                                    <span className="ai-engineer-check">
                                      <input
                                        type="checkbox"
                                        checked={rememberRead}
                                        onChange={(e) =>
                                          setRememberRead(e.target.checked)
                                        }
                                      />
                                      <span
                                        className="ai-engineer-check-box"
                                        aria-hidden
                                      />
                                    </span>
                                    <span className="ai-engineer-remember-read-text">
                                      {t("aiEngineer.rememberReadOnly", {
                                        tools:
                                          line.rememberableBinaries.join(", "),
                                      })}
                                    </span>
                                  </label>
                                ) : null}
                                {isActive &&
                                !dual &&
                                threadSecurityMode !== "production" ? (
                                  <label
                                    className="ai-engineer-remember-read"
                                    data-testid="ai-engineer-approval-permanent"
                                  >
                                    <span className="ai-engineer-check">
                                      <input
                                        type="checkbox"
                                        checked={approvePermanently}
                                        onChange={(e) =>
                                          setApprovePermanently(
                                            e.target.checked,
                                          )
                                        }
                                      />
                                      <span
                                        className="ai-engineer-check-box"
                                        aria-hidden
                                      />
                                    </span>
                                    <span className="ai-engineer-remember-read-text">
                                      {t("aiEngineer.approvePermanently")}
                                    </span>
                                  </label>
                                ) : null}
                              </div>
                              <div className="ai-engineer-approval-actions">
                                <button
                                  type="button"
                                  className="ai-engineer-stop"
                                  data-testid="ai-engineer-approval-reject"
                                  disabled={!isActive}
                                  onClick={() => {
                                    resolveApproval(false);
                                    setConfirmDraft("");
                                    setRememberRead(false);
                                    setApprovePermanently(false);
                                  }}
                                >
                                  {t("aiEngineer.reject")}
                                </button>
                                {isActive &&
                                !dual &&
                                threadSecurityMode !== "production" ? (
                                  <button
                                    type="button"
                                    className="find-panel-run"
                                    data-testid="ai-engineer-approval-session"
                                    disabled={!canApprove}
                                    onClick={() => {
                                      resolveApproval(
                                        true,
                                        undefined,
                                        rememberRead,
                                        true,
                                        approvePermanently,
                                      );
                                      setConfirmDraft("");
                                      setRememberRead(false);
                                      setApprovePermanently(false);
                                    }}
                                  >
                                    {t("aiEngineer.approveSession")}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="find-panel-run is-primary"
                                  data-testid="ai-engineer-approval-once"
                                  disabled={!canApprove}
                                  onClick={() => {
                                    resolveApproval(
                                      true,
                                      dual ? confirmDraft.trim() : undefined,
                                      rememberRead,
                                      false,
                                      dual ? false : approvePermanently,
                                    );
                                    setConfirmDraft("");
                                    setRememberRead(false);
                                    setApprovePermanently(false);
                                  }}
                                >
                                  {t("aiEngineer.approveOnce")}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={rowKey}
                      className={`ai-engineer-line ${line.kind}${
                        findOpen &&
                        findMatches[findMatchIndex]?.lineId === line.id
                          ? " is-find-current"
                          : findOpen &&
                              findMatches.some((m) => m.lineId === line.id)
                            ? " is-find-hit"
                            : ""
                      }`}
                      data-ai-assistant={line.kind === "assistant" ? "1" : undefined}
                      data-chat-node-id={
                        line.kind === "user" || line.kind === "assistant"
                          ? line.id
                          : undefined
                      }
                    >
                      {line.kind === "assistant" ? (
                        <div className="ai-engineer-assistant-wrap">
                          {typeof line.toolEvidence === "boolean" &&
                          !line.streaming &&
                          line.toolEvidence === false ? (
                            <div
                              className="ai-engineer-evidence-badge no-tools"
                              data-testid="ai-engineer-evidence-badge"
                            >
                              {t("aiEngineer.evidenceNoTools")}
                            </div>
                          ) : null}
                          {!line.streaming &&
                          !markdownHasImage(line.content) ? (
                            <TurnMediaGallery
                              items={collectTurnImageMedia(messages, index)}
                              onImageClick={(src) => {
                                setAttachmentPreview({
                                  kind: "image",
                                  title: t("aiEngineer.attachPreview"),
                                  mediaUrl: src,
                                });
                              }}
                            />
                          ) : null}
                          <AiMarkdown
                            content={line.content}
                            streaming={!!line.streaming}
                            onImageClick={(src, alt) => {
                              setAttachmentPreview({
                                kind: "image",
                                title: alt || t("aiEngineer.attachPreview"),
                                mediaUrl: src,
                              });
                            }}
                          />
                          {line.streaming ? (
                            <span className="ai-engineer-stream-cursor" aria-hidden>
                              ▍
                            </span>
                          ) : null}
                          {isAssistantReplyCopyAnchor(messages, index) ? (
                            <div className="ai-engineer-assistant-toolbar ai-engineer-assistant-toolbar-end">
                              <button
                                type="button"
                                className="ai-engineer-copy-btn"
                                data-testid="ai-engineer-save-skill"
                                aria-label={t("aiEngineer.saveAsSkill")}
                                title={t("aiEngineer.saveAsSkill")}
                                disabled={!ready || !canChat || busy}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requestSaveAsSkill();
                                }}
                              >
                                <BookmarkPlus size={14} aria-hidden />
                              </button>
                              <ChatCopyButton
                                text={wholeAssistantReplyText(messages, index)}
                                testId="ai-engineer-copy-reply"
                                label={t("aiEngineer.copyReply")}
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : line.kind === "user" ? (
                        <div className="ai-engineer-user-wrap">
                          <div className="ai-engineer-user-toolbar">
                            <ChatCopyButton
                              text={line.content}
                              testId="ai-engineer-copy-user"
                              label={t("aiEngineer.copyMessage")}
                            />
                          </div>
                          <div className="ai-engineer-user-body">{line.content}</div>
                        </div>
                      ) : (
                        line.content
                      )}
                    </div>
                  );
                })}
                {shouldShowChatBusyLine({
                  busy,
                  busyPhaseKind: busyPhase.kind,
                  hasVisibleStreamingAssistant: messages.some(
                    (m) =>
                      m.kind === "assistant" &&
                      m.streaming &&
                      Boolean(m.content.trim()),
                  ),
                }) ? (
                  <div
                    className="ai-engineer-line thought ai-engineer-typing"
                    data-testid="ai-engineer-busy-phase"
                    data-busy-phase={busyPhase.kind}
                  >
                    {(busyPhase.kind === "thinking" ||
                      busyPhase.kind === "sudo" ||
                      busyPhase.kind === "awaiting_exec" ||
                      busyPhase.kind === "approval") && (
                      <AiBusyDots />
                    )}{" "}
                    {busyLabel}
                  </div>
                ) : null}
                <div
                  className="ai-engineer-scroll-anchor"
                  data-scroll-fix={AI_CHAT_SCROLL_FIX_ID}
                  aria-hidden
                />
                </div>
              </div>
              <div className="ai-engineer-composer-stack">
              <AiEngineerRunTraceBar spans={runTraceSpans} busy={busy} />
              <div className="ai-engineer-composer" data-testid="ai-engineer-composer">
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
                <AiEngineerComposerTextarea
                  ref={textareaRef}
                  placeholder={inputPlaceholder}
                  disabled={!ready || !canChat}
                  onPaste={onComposerPaste}
                  onSubmit={submit}
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
                        ref={modelTriggerRef}
                        className="ai-engineer-model-btn"
                        aria-label={t("aiEngineer.modelPicker")}
                        aria-expanded={modelOpen}
                        data-testid="ai-engineer-model-picker"
                        disabled={!ready}
                        onPointerDown={(e) => {
                          if (shouldPreventComposerChromeFocusScroll()) {
                            e.preventDefault();
                          }
                          beginComposerChromeScrollLock();
                        }}
                        onMouseDown={(e) => {
                          if (shouldPreventComposerChromeFocusScroll()) {
                            e.preventDefault();
                          }
                        }}
                        onClick={() => {
                          runWithComposerChromeScrollGuard(() => {
                            setModelOpen((v) => !v);
                            setHistoryOpen(false);
                            setSecurityOpen(false);
                            setInteractionOpen(false);
                            setAttachMenuOpen(false);
                            setOutlineOpen(false);
                          });
                        }}
                      >
                        <span className="ai-engineer-model-btn-label">
                          {canChat
                            ? activeProfileLabel
                            : t("aiEngineer.configureModelTitle")}
                        </span>
                        <ChevronDown
                          size={14}
                          strokeWidth={2.25}
                          className="dropdown-chevron"
                          aria-hidden
                        />
                      </button>
                      {modelOpen
                        ? createPortal(
                            <div
                              ref={modelMenuRef}
                              className="ai-engineer-menu ai-engineer-model-menu ai-engineer-menu-portal"
                              role="menu"
                              data-testid="ai-engineer-model-menu"
                              style={{
                                position: "fixed",
                                top: modelMenuPos?.top ?? -9999,
                                left: modelMenuPos?.left ?? -9999,
                                width: 248,
                                zIndex: 35100,
                                visibility: modelMenuPos ? "visible" : "hidden",
                                maxHeight: "min(420px, calc(100vh - 16px))",
                                overflowY: "auto",
                              }}
                            >
                              <div
                                className="ai-engineer-menu-section-label"
                                data-testid="ai-engineer-runtime-section"
                              >
                                {t("aiEngineer.runtime.section")}
                              </div>
                              <button
                                type="button"
                                className={`ai-engineer-menu-item${
                                  agentRuntime === "builtin" ? " active" : ""
                                }`}
                                role="menuitem"
                                data-testid="ai-engineer-runtime-builtin"
                                onMouseDown={(e) => {
                                  if (shouldPreventComposerChromeFocusScroll()) {
                                    e.preventDefault();
                                  }
                                }}
                                onClick={() => {
                                  selectExternalRuntime("builtin");
                                }}
                              >
                                <span className="ai-engineer-model-name">
                                  {t("aiEngineer.runtime.builtin")}
                                </span>
                                <span className="ai-engineer-model-id">
                                  {t("aiEngineer.runtime.builtinHint")}
                                </span>
                              </button>
                              <button
                                type="button"
                                className={`ai-engineer-menu-item${
                                  agentRuntime === "cursor" ? " active" : ""
                                }`}
                                role="menuitem"
                                data-testid="ai-engineer-runtime-cursor"
                                onMouseDown={(e) => {
                                  if (shouldPreventComposerChromeFocusScroll()) {
                                    e.preventDefault();
                                  }
                                }}
                                onClick={() => {
                                  selectExternalRuntime("cursor");
                                }}
                              >
                                <span className="ai-engineer-model-name">
                                  {t("aiEngineer.runtime.cursor")}
                                </span>
                                <span className="ai-engineer-model-id">
                                  {t("aiEngineer.runtime.cursorHint")}
                                </span>
                              </button>
                              <button
                                type="button"
                                className={`ai-engineer-menu-item${
                                  agentRuntime === "codex" ? " active" : ""
                                }`}
                                role="menuitem"
                                data-testid="ai-engineer-runtime-codex"
                                onMouseDown={(e) => {
                                  if (shouldPreventComposerChromeFocusScroll()) {
                                    e.preventDefault();
                                  }
                                }}
                                onClick={() => {
                                  selectExternalRuntime("codex");
                                }}
                              >
                                <span className="ai-engineer-model-name">
                                  {t("aiEngineer.runtime.codex")}
                                </span>
                                <span className="ai-engineer-model-id">
                                  {t("aiEngineer.runtime.codexHint")}
                                </span>
                              </button>
                              <button
                                type="button"
                                className={`ai-engineer-menu-item${
                                  agentRuntime === "claude" ? " active" : ""
                                }`}
                                role="menuitem"
                                data-testid="ai-engineer-runtime-claude"
                                onMouseDown={(e) => {
                                  if (shouldPreventComposerChromeFocusScroll()) {
                                    e.preventDefault();
                                  }
                                }}
                                onClick={() => {
                                  selectExternalRuntime("claude");
                                }}
                              >
                                <span className="ai-engineer-model-name">
                                  {t("aiEngineer.runtime.claude")}
                                </span>
                                <span className="ai-engineer-model-id">
                                  {t("aiEngineer.runtime.claudeHint")}
                                </span>
                              </button>
                              {agentRuntime !== "builtin" ? (
                                <div
                                  className="ai-engineer-runtime-install"
                                  data-testid="ai-engineer-runtime-install"
                                >
                                  <p className="ai-engineer-runtime-install-status">
                                    {runtimeProbing
                                      ? "…"
                                      : (() => {
                                          const st = externalRuntimeStatusKind(
                                            runtimeProbe,
                                            agentRuntime,
                                          );
                                          if (st === "ready" || st === "ready_fake") {
                                            return t("aiEngineer.runtime.statusReady");
                                          }
                                          if (st === "install_needed") {
                                            return t("aiEngineer.runtime.statusInstallNeeded");
                                          }
                                          return t("aiEngineer.runtime.statusUnknown");
                                        })()}
                                  </p>
                                  {externalRuntimeStatusKind(
                                    runtimeProbe,
                                    agentRuntime,
                                  ) === "install_needed" ? (
                                    <>
                                      <p className="ai-engineer-runtime-install-hint">
                                        {t("aiEngineer.runtime.installHint")}
                                      </p>
                                      {runtimeProbe?.install_url ? (
                                        <a
                                          className="ai-engineer-runtime-install-link"
                                          href={runtimeProbe.install_url}
                                          target="_blank"
                                          rel="noreferrer"
                                          data-testid="ai-engineer-runtime-install-link"
                                        >
                                          {t("aiEngineer.runtime.installOpen")}
                                        </a>
                                      ) : null}
                                      <button
                                        type="button"
                                        className="ai-engineer-text-btn"
                                        data-testid="ai-engineer-runtime-recheck"
                                        disabled={runtimeProbing}
                                        onClick={() =>
                                          void refreshRuntimeProbe(agentRuntime)
                                        }
                                      >
                                        {t("aiEngineer.runtime.recheck")}
                                      </button>
                                    </>
                                  ) : null}
                                </div>
                              ) : null}
                              <p
                                className="ai-engineer-runtime-disclaimer"
                                data-testid="ai-engineer-runtime-disclaimer"
                              >
                                {t("aiEngineer.runtime.dualPlaneDisclaimer")}
                              </p>
                              <div className="ai-engineer-menu-section-label">
                                {t("aiEngineer.runtime.builtinProfiles")}
                              </div>
                              {profiles.length === 0 ? (
                                <div className="ai-engineer-menu-empty">
                                  {t("aiEngineer.noModels")}
                                </div>
                              ) : (
                                profiles.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    className={`ai-engineer-menu-item${
                                      agentRuntime === "builtin" &&
                                      p.id === settings?.active_profile_id
                                        ? " active"
                                        : ""
                                    }`}
                                    role="menuitem"
                                    onMouseDown={(e) => {
                                      if (shouldPreventComposerChromeFocusScroll()) {
                                        e.preventDefault();
                                      }
                                    }}
                                    onClick={() => {
                                      runWithComposerChromeScrollGuard(() => {
                                        setModelOpen(false);
                                      });
                                      void saveSettings({
                                        active_profile_id: p.id,
                                      });
                                      setAgentRuntime("builtin");
                                    }}
                                  >
                                    <span className="ai-engineer-model-name">
                                      {p.name}
                                    </span>
                                    <span className="ai-engineer-model-id">
                                      {p.model}
                                    </span>
                                  </button>
                                ))
                              )}
                              <button
                                type="button"
                                className="ai-engineer-menu-item ai-engineer-menu-manage"
                                role="menuitem"
                                data-testid="ai-engineer-manage-models"
                                onMouseDown={(e) => {
                                  if (shouldPreventComposerChromeFocusScroll()) {
                                    e.preventDefault();
                                  }
                                }}
                                onClick={() => {
                                  runWithComposerChromeScrollGuard(() => {
                                    setModelOpen(false);
                                    openSettings();
                                  });
                                }}
                              >
                                {t("aiEngineer.manageModels")}
                              </button>
                            </div>,
                            document.body,
                          )
                        : null}
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
                        disabled={!ready || !canChat}
                        onPointerDown={(e) => {
                          if (shouldPreventComposerChromeFocusScroll()) {
                            e.preventDefault();
                          }
                          beginComposerChromeScrollLock();
                        }}
                        onMouseDown={(e) => {
                          if (shouldPreventComposerChromeFocusScroll()) {
                            e.preventDefault();
                          }
                        }}
                        onClick={() => {
                          runWithComposerChromeScrollGuard(() => {
                            setAttachMenuOpen((v) => !v);
                            setModelOpen(false);
                            setSecurityOpen(false);
                            setInteractionOpen(false);
                            setHistoryOpen(false);
                          });
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
                    <AiEngineerComposerSendButton
                      busy={busy}
                      ready={ready}
                      modelConfigured={canChat}
                      stopLabel={t("aiEngineer.stop")}
                      sendLabel={t("aiEngineer.send")}
                      onStop={() => stopActiveRun()}
                      onSend={submit}
                    />
                  </div>
                </div>
              </div>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
      {settingsOpen
        ? createPortal(<AiEngineerSettings />, document.body)
        : null}
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
