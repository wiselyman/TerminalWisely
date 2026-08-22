import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { riskDescKey, riskLabelKey } from "../../lib/aiEngineer/riskLabels";
import {
  normalizeSecurityMode,
  useAiEngineerStore,
} from "../../stores/aiEngineerStore";
import { AiEngineerSettings } from "./AiEngineerSettings";
import { SecurityModePicker } from "./SecurityModePicker";
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
  highlightShell,
  summarizeShellTools,
} from "../../lib/aiEngineer/shellHighlight";

type Props = {
  sessionId: string;
  serverId?: string;
};

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
  // Cursor: collapsed = header only; body only after click (open while running).
  const [expanded, setExpanded] = useState(() => running);

  useEffect(() => {
    if (running) setExpanded(true);
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
    return (
      <details className="ai-engineer-tool-row" open>
        <summary>
          <span className="ai-engineer-tool-name">{line.name}</span>
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
    void navigator.clipboard?.writeText(text).catch(() => undefined);
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
  const messagesRef = useRef<HTMLDivElement>(null);
  const [confirmDraft, setConfirmDraft] = useState("");
  const [askDraft, setAskDraft] = useState("");
  const [rememberRead, setRememberRead] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const panelRef = useWorkspacePanelEnter<HTMLElement>();

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

  const profiles = settings?.profiles ?? [];
  const activeProfile =
    profiles.find((p) => p.id === settings?.active_profile_id) ?? profiles[0];

  useEffect(() => {
    if (!open) return;
    bindContext(sessionId, serverId);
  }, [open, sessionId, serverId, bindContext]);

  useEffect(() => {
    if (!pendingApproval) {
      setRememberRead(false);
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
    void sendMessage({ sessionId, serverId });
  };

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
        aria-label="AI Linux Engineer"
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
          {starting ? (
            <p className="find-panel-empty">
              {bootstrapStatus || t("aiEngineer.starting")}
            </p>
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
                {messages.length === 0 ? (
                  <p className="find-panel-empty">{t("aiEngineer.hint")}</p>
                ) : null}
                {messages.map((line, index) => {
                  const rowKey = `${line.id}__${index}`;
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
                                );
                                setConfirmDraft("");
                                setRememberRead(false);
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
                {busy ? (
                  <p className="ai-engineer-interrupt-hint">{t("aiEngineer.interruptHint")}</p>
                ) : null}
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t("aiEngineer.inputPlaceholder")}
                  rows={3}
                  disabled={!ready}
                  onKeyDown={(e) => {
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
                    <div className="ai-engineer-menu-wrap ai-engineer-model-wrap">
                      <button
                        type="button"
                        className="ai-engineer-model-btn"
                        aria-label={t("aiEngineer.modelPicker")}
                        aria-expanded={modelOpen}
                        disabled={!ready}
                        onClick={() => {
                          setModelOpen((v) => !v);
                          setHistoryOpen(false);
                          setSecurityOpen(false);
                        }}
                      >
                      {activeProfile
                        ? activeProfile.name.trim() === activeProfile.model.trim()
                          ? activeProfile.model
                          : `${activeProfile.name} · ${activeProfile.model}`
                        : t("aiEngineer.noModels")}
                      <span aria-hidden>▾</span>
                    </button>
                    {modelOpen ? (
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
                              className={`ai-engineer-menu-item${p.id === activeProfile?.id ? " active" : ""}`}
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
                      onOpenChange={(open) => {
                        setSecurityOpen(open);
                        if (open) {
                          setModelOpen(false);
                          setHistoryOpen(false);
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
                    {busy ? (
                      <button
                        type="button"
                        className="ai-engineer-stop"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => stopActiveRun()}
                      >
                        {t("aiEngineer.stop")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="ai-engineer-send"
                      disabled={!ready || busy || !input.trim()}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={submit}
                    >
                      {t("aiEngineer.send")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
      {settingsOpen ? <AiEngineerSettings /> : null}
    </>
  );
}
