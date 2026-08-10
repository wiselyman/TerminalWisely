import { Channel, invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../isTauri";
import { sidecarFetch, type SidecarInfo } from "./api";
import { executeToolCall, type ToolCallEvent } from "./toolBridge";

export type AgentUiEvent =
  | { type: "assistant_message"; content: string }
  | { type: "assistant_delta"; text: string }
  | { type: "user_message"; content: string }
  | {
      type: "tool_call";
      call_id: string;
      name: string;
      arguments: Record<string, unknown>;
      denied?: boolean;
      awaiting_host?: boolean;
    }
  | {
      type: "ask_user";
      request_id: string;
      title?: string;
      question: string;
      kind?: string;
      options?: Array<{ id: string; label: string; description?: string }>;
      recommended_option_id?: string;
      why_needed?: string;
    }
  | {
      type: "approval_needed";
      approval_id: string;
      command: string;
      risk: string;
      reason: string;
      summary?: string;
      impact_preview?: string;
      network_guard?: boolean;
      dual_confirm?: boolean;
      confirm_phrase?: string;
      exec_command?: string;
    }
  | { type: "completed"; content?: string }
  | { type: "error"; message: string }
  | { type: "cancelled" }
  | { type: "status"; status: string; run_id?: string; phase?: string };

export type AskUserHandler = (event: Extract<AgentUiEvent, { type: "ask_user" }>) => Promise<{
  selected_option_ids: string[];
  free_text?: string;
}>;

export type ApprovalHandler = (
  event: Extract<AgentUiEvent, { type: "approval_needed" }>,
) => Promise<{ approved: boolean; confirm_text?: string }>;

type StreamEvent = {
  type: string;
  payload?: Record<string, unknown>;
  seq?: number;
  run_id?: string;
  status?: string;
  cursor?: number;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function handleProtocolEvent(opts: {
  sidecar: SidecarInfo;
  sessionId: string;
  runId: string;
  ev: StreamEvent;
  handled: Set<string>;
  onEvent: (event: AgentUiEvent) => void;
  onAskUser: AskUserHandler;
  onApproval: ApprovalHandler;
}): Promise<"continue" | "terminal"> {
  const { sidecar, sessionId, runId, ev, handled, onEvent, onAskUser, onApproval } = opts;
  const p = ev.payload ?? {};
  const activeRunId = ev.run_id || runId;

  if (ev.type === "assistant_message") {
    onEvent({ type: "assistant_message", content: String(p.content ?? "") });
  } else if (ev.type === "assistant_delta") {
    onEvent({ type: "assistant_delta", text: String(p.text ?? "") });
  } else if (ev.type === "status") {
    onEvent({
      type: "status",
      status: String(p.status ?? p.phase ?? ""),
      run_id: typeof p.run_id === "string" ? p.run_id : activeRunId,
      phase: typeof p.phase === "string" ? p.phase : undefined,
    });
  } else if (ev.type === "run_status") {
    onEvent({
      type: "status",
      status: String(p.status ?? ev.status ?? ""),
      run_id: activeRunId,
      phase: typeof p.phase === "string" ? p.phase : undefined,
    });
  } else if (ev.type === "completed") {
    onEvent({ type: "completed", content: String(p.content ?? "") });
  } else if (ev.type === "cancelled") {
    onEvent({ type: "cancelled" });
  } else if (ev.type === "error") {
    onEvent({ type: "error", message: String(p.message ?? "error") });
  } else if (ev.type === "approval_needed") {
    const approvalId = String(p.approval_id ?? "");
    if (!approvalId || handled.has(`appr:${approvalId}`)) return "continue";
    handled.add(`appr:${approvalId}`);
    const approvalEvent: Extract<AgentUiEvent, { type: "approval_needed" }> = {
      type: "approval_needed",
      approval_id: approvalId,
      command: String(p.command ?? ""),
      risk: String(p.risk ?? ""),
      reason: String(p.reason ?? ""),
      summary: typeof p.summary === "string" ? p.summary : undefined,
      impact_preview: typeof p.impact_preview === "string" ? p.impact_preview : undefined,
      network_guard: Boolean(p.network_guard),
      dual_confirm: Boolean(p.dual_confirm),
      confirm_phrase: typeof p.confirm_phrase === "string" ? p.confirm_phrase : undefined,
      exec_command: typeof p.exec_command === "string" ? p.exec_command : undefined,
    };
    onEvent(approvalEvent);
    const decision = await onApproval(approvalEvent);
    await sidecarFetch(sidecar, "/v1/approval_decision", {
      method: "POST",
      body: JSON.stringify({
        session_id: sessionId,
        run_id: activeRunId,
        approval_id: approvalId,
        approved: decision.approved,
        confirm_text: decision.confirm_text ?? null,
      }),
    });
  } else if (ev.type === "tool_call") {
    const callId = String(p.call_id ?? "");
    const name = String(p.name ?? "");
    const args = (p.arguments as Record<string, unknown>) || {};
    onEvent({
      type: "tool_call",
      call_id: callId,
      name,
      arguments: args,
      denied: Boolean(p.denied),
      awaiting_host: Boolean(p.awaiting_host),
    });
    if (p.denied || handled.has(callId)) return "continue";
    if (name === "terminal_exec" || name === "ai_exec") {
      if (!p.awaiting_host) return "continue";
      handled.add(callId);
      const lease = (p.lease as ToolCallEvent["lease"]) || null;
      const result = await executeToolCall(sessionId, {
        call_id: callId,
        name,
        arguments: args,
        requires_lease: Boolean(p.requires_lease),
        lease,
      });
      await sidecarFetch(sidecar, "/v1/tool_result", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          run_id: activeRunId,
          call_id: callId,
          ok: result.ok !== false,
          stdout: String(result.stdout ?? ""),
          stderr: String(result.stderr ?? ""),
          exit_code: typeof result.exit_code === "number" ? result.exit_code : null,
          error: typeof result.error === "string" ? result.error : null,
          untrusted: true,
        }),
      });
    }
  } else if (ev.type === "ask_user") {
    const requestId = String(p.request_id ?? p.call_id ?? "");
    if (!requestId || handled.has(`ask:${requestId}`)) return "continue";
    handled.add(`ask:${requestId}`);
    const askEvent: Extract<AgentUiEvent, { type: "ask_user" }> = {
      type: "ask_user",
      request_id: requestId,
      title: typeof p.title === "string" ? p.title : undefined,
      question: String(p.question ?? ""),
      kind: typeof p.kind === "string" ? p.kind : undefined,
      options: Array.isArray(p.options)
        ? (p.options as Array<{ id: string; label: string; description?: string }>)
        : undefined,
      recommended_option_id:
        typeof p.recommended_option_id === "string" ? p.recommended_option_id : undefined,
      why_needed: typeof p.why_needed === "string" ? p.why_needed : undefined,
    };
    onEvent(askEvent);
    const answer = await onAskUser(askEvent);
    await sidecarFetch(sidecar, "/v1/user_answer", {
      method: "POST",
      body: JSON.stringify({
        session_id: sessionId,
        run_id: activeRunId,
        request_id: requestId,
        selected_option_ids: answer.selected_option_ids,
        free_text: answer.free_text ?? null,
      }),
    });
  } else if (ev.type === "stream_end") {
    const st = String(p.status ?? ev.status ?? "");
    if (st === "cancelled") onEvent({ type: "cancelled" });
    return "terminal";
  }

  const st = String(ev.status ?? "");
  if (st === "completed" || st === "failed" || st === "cancelled" || st === "idle") {
    if (st === "cancelled") onEvent({ type: "cancelled" });
    return "terminal";
  }
  return "continue";
}

async function runAgentChatViaStream(opts: {
  sidecar: SidecarInfo;
  sessionId: string;
  runId: string;
  onEvent: (event: AgentUiEvent) => void;
  onAskUser: AskUserHandler;
  onApproval: ApprovalHandler;
  signal?: AbortSignal;
}): Promise<void> {
  const { sidecar, sessionId, runId, onEvent, onAskUser, onApproval, signal } = opts;
  const handled = new Set<string>();
  // Serialize event handlers so tool/approval awaits don't race.
  let chain: Promise<void> = Promise.resolve();
  let terminal = false;

  await new Promise<void>((resolve, reject) => {
    const channel = new Channel<StreamEvent>();
    const onAbort = () => {
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    channel.onmessage = (msg) => {
      chain = chain
        .then(async () => {
          if (terminal || signal?.aborted) return;
          const result = await handleProtocolEvent({
            sidecar,
            sessionId,
            runId,
            ev: msg,
            handled,
            onEvent,
            onAskUser,
            onApproval,
          });
          if (result === "terminal") {
            terminal = true;
          }
        })
        .catch((err) => {
          reject(err);
        });
    };

    void invoke("ai_sidecar_stream", {
      sessionId,
      runId,
      cursor: 0,
      onEvent: channel,
    })
      .then(async () => {
        await chain;
        signal?.removeEventListener("abort", onAbort);
        resolve();
      })
      .catch((err) => {
        signal?.removeEventListener("abort", onAbort);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

/** Fallback pull loop (non-Tauri / stream failure). */
async function runAgentChatViaPull(opts: {
  sidecar: SidecarInfo;
  sessionId: string;
  runId: string;
  onEvent: (event: AgentUiEvent) => void;
  onAskUser: AskUserHandler;
  onApproval: ApprovalHandler;
  signal?: AbortSignal;
}): Promise<void> {
  const { sidecar, sessionId, runId, onEvent, onAskUser, onApproval, signal } = opts;
  let cursor = 0;
  const handled = new Set<string>();

  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const pullRes = await sidecarFetch(
      sidecar,
      `/v1/sessions/${encodeURIComponent(sessionId)}/pull?cursor=${cursor}&run_id=${encodeURIComponent(runId)}`,
      { signal },
    );
    if (!pullRes.ok) {
      throw new Error(`pull failed: ${pullRes.status} ${await pullRes.text()}`);
    }
    const snap = (await pullRes.json()) as {
      status: string;
      events: StreamEvent[];
      cursor: number;
      run_id: string;
    };
    cursor = snap.cursor ?? cursor;
    const activeRunId = snap.run_id || runId;

    for (const ev of snap.events ?? []) {
      const result = await handleProtocolEvent({
        sidecar,
        sessionId,
        runId: activeRunId,
        ev: { ...ev, status: snap.status, run_id: activeRunId },
        handled,
        onEvent,
        onAskUser,
        onApproval,
      });
      if (result === "terminal") return;
    }

    if (
      snap.status === "completed" ||
      snap.status === "failed" ||
      snap.status === "idle" ||
      snap.status === "cancelled"
    ) {
      if (snap.status === "cancelled") onEvent({ type: "cancelled" });
      return;
    }
    await sleep(200, signal);
  }
}

export async function runAgentChat(opts: {
  sidecar: SidecarInfo;
  sessionId: string;
  message: string;
  securityMode?: string;
  serverId?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  onEvent: (event: AgentUiEvent) => void;
  onAskUser: AskUserHandler;
  onApproval: ApprovalHandler;
  signal?: AbortSignal;
}): Promise<{ runId: string }> {
  const {
    sidecar,
    sessionId,
    message,
    securityMode,
    serverId,
    history,
    onEvent,
    onAskUser,
    onApproval,
    signal,
  } = opts;

  const startRes = await sidecarFetch(sidecar, "/v1/chat/start", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      message,
      security_mode: securityMode ?? null,
      server_id: serverId ?? null,
      history: history ?? [],
    }),
    signal,
  });
  if (!startRes.ok) {
    throw new Error(`chat start failed: ${startRes.status} ${await startRes.text()}`);
  }
  const startJson = (await startRes.json()) as { run_id?: string; status?: string };
  const runId = startJson.run_id ?? "";
  onEvent({ type: "status", status: startJson.status ?? "running", run_id: runId });

  if (isTauriRuntime()) {
    try {
      await runAgentChatViaStream({
        sidecar,
        sessionId,
        runId,
        onEvent,
        onAskUser,
        onApproval,
        signal,
      });
      return { runId };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      // Fall through to pull if streamable HTTP fails.
    }
  }

  await runAgentChatViaPull({
    sidecar,
    sessionId,
    runId,
    onEvent,
    onAskUser,
    onApproval,
    signal,
  });
  return { runId };
}

export async function cancelAgentRun(
  sidecar: SidecarInfo,
  sessionId: string,
  runId: string,
): Promise<void> {
  await sidecarFetch(sidecar, `/v1/runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, run_id: runId }),
  });
}
