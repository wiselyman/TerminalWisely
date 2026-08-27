import { Channel, invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../isTauri";
import { sidecarFetch, type SidecarInfo } from "./api";
import { executeToolCall, type ToolCallEvent, type ToolExecCallbacks } from "./toolBridge";
import type { K8sClusterTarget } from "../k8s/types";

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
      intent?: string;
      impact_preview?: string;
      rememberable_binaries?: string[];
      network_guard?: boolean;
      dual_confirm?: boolean;
      confirm_phrase?: string;
      exec_command?: string;
    }
  | { type: "completed"; content?: string }
  | { type: "error"; message: string }
  | { type: "cancelled" }
  | { type: "status"; status: string; run_id?: string; phase?: string }
  | {
      type: "plan_progress";
      explanation?: string;
      plan: Array<{ step: string; status: string }>;
    }
  | {
      type: "compaction";
      compaction_id?: string;
      shadowed_tokens?: number;
      summary_tokens?: number;
      trigger?: string;
    }
  | { type: "session_resumed"; from_run_id?: string; messages?: number }
  | {
      type: "investigator_start";
      child_run_id: string;
      question: string;
      focus?: string;
    }
  | {
      type: "investigator_end";
      child_run_id: string;
      ok: boolean;
      status?: string;
      summary_preview?: string;
      error?: string;
    };

export type AskUserHandler = (event: Extract<AgentUiEvent, { type: "ask_user" }>) => Promise<{
  selected_option_ids: string[];
  free_text?: string;
}>;

export type ApprovalHandler = (
  event: Extract<AgentUiEvent, { type: "approval_needed" }>,
) => Promise<{
  approved: boolean;
  confirm_text?: string;
  remember_read_binaries?: string[];
  approve_for_session?: boolean;
  approve_permanently?: boolean;
}>;

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
  onToolExec?: ToolExecCallbacks & {
    onStart?: (info: { callId: string; command: string; intent?: string }) => void;
    onDone?: (info: {
      callId: string;
      ok: boolean;
      exitCode?: number | null;
      error?: string;
      stdout?: string;
      stderr?: string;
    }) => void;
  };
}): Promise<"continue" | "terminal"> {
  const {
    sidecar,
    sessionId,
    runId,
    ev,
    handled,
    onEvent,
    onAskUser,
    onApproval,
    onToolExec,
  } = opts;
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
      intent: typeof p.intent === "string" ? p.intent : undefined,
      impact_preview: typeof p.impact_preview === "string" ? p.impact_preview : undefined,
      rememberable_binaries: Array.isArray(p.rememberable_binaries)
        ? (p.rememberable_binaries as string[]).filter((b) => typeof b === "string")
        : undefined,
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
        remember_read_binaries: decision.remember_read_binaries ?? [],
        approve_for_session: Boolean(decision.approve_for_session),
        approve_permanently: Boolean(decision.approve_permanently),
      }),
    });
  } else if (ev.type === "plan_progress") {
    const plan = Array.isArray(p.plan)
      ? (p.plan as Array<{ step?: string; status?: string }>)
          .filter((x) => x && typeof x.step === "string")
          .map((x) => ({
            step: String(x.step),
            status: String(x.status ?? "pending"),
          }))
      : [];
    onEvent({
      type: "plan_progress",
      explanation: typeof p.explanation === "string" ? p.explanation : undefined,
      plan,
    });
  } else if (ev.type === "compaction") {
    onEvent({
      type: "compaction",
      compaction_id:
        typeof p.compaction_id === "string" ? p.compaction_id : undefined,
      shadowed_tokens:
        typeof p.shadowed_tokens === "number" ? p.shadowed_tokens : undefined,
      summary_tokens:
        typeof p.summary_tokens === "number" ? p.summary_tokens : undefined,
      trigger: typeof p.trigger === "string" ? p.trigger : undefined,
    });
  } else if (ev.type === "session_resumed") {
    onEvent({
      type: "session_resumed",
      from_run_id: typeof p.from_run_id === "string" ? p.from_run_id : undefined,
      messages: typeof p.messages === "number" ? p.messages : undefined,
    });
  } else if (ev.type === "investigator_start") {
    onEvent({
      type: "investigator_start",
      child_run_id: String(p.child_run_id ?? ""),
      question: String(p.question ?? ""),
      focus: typeof p.focus === "string" ? p.focus : undefined,
    });
  } else if (ev.type === "investigator_end") {
    onEvent({
      type: "investigator_end",
      child_run_id: String(p.child_run_id ?? ""),
      ok: Boolean(p.ok),
      status: typeof p.status === "string" ? p.status : undefined,
      summary_preview:
        typeof p.summary_preview === "string" ? p.summary_preview : undefined,
      error: typeof p.error === "string" ? p.error : undefined,
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
      const command = String(args.command ?? "").trim();
      const intent =
        typeof args.intent === "string" && args.intent.trim()
          ? args.intent.trim()
          : undefined;
      onToolExec?.onStart?.({ callId, command, intent });
      const result = await executeToolCall(
        sessionId,
        {
          call_id: callId,
          name,
          arguments: args,
          requires_lease: Boolean(p.requires_lease),
          lease: (p.lease as ToolCallEvent["lease"]) || null,
        },
        { onOutput: onToolExec?.onOutput },
      );
      onToolExec?.onDone?.({
        callId,
        ok: result.ok !== false,
        exitCode: typeof result.exit_code === "number" ? result.exit_code : null,
        error: typeof result.error === "string" ? result.error : undefined,
        stdout: typeof result.stdout === "string" ? result.stdout : undefined,
        stderr: typeof result.stderr === "string" ? result.stderr : undefined,
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
    } else if (name.startsWith("k8s_")) {
      if (!p.awaiting_host) return "continue";
      handled.add(callId);
      const intent =
        typeof args.intent === "string" && args.intent.trim()
          ? args.intent.trim()
          : name;
      const commandHint = String(
        (args.kind && args.name
          ? `${args.kind}/${args.namespace ?? ""}/${args.name}`
          : "") ||
          (args.category as string) ||
          (args.pod as string) ||
          (args.name as string) ||
          name,
      );
      onToolExec?.onStart?.({ callId, command: commandHint, intent });
      const result = await executeToolCall(
        sessionId,
        {
          call_id: callId,
          name,
          arguments: args,
          requires_lease: Boolean(p.requires_lease),
          lease: (p.lease as ToolCallEvent["lease"]) || null,
        },
        { onOutput: onToolExec?.onOutput },
      );
      onToolExec?.onDone?.({
        callId,
        ok: result.ok !== false,
        exitCode: typeof result.exit_code === "number" ? result.exit_code : null,
        error: typeof result.error === "string" ? result.error : undefined,
        stdout: typeof result.stdout === "string" ? result.stdout : undefined,
        stderr: typeof result.stderr === "string" ? result.stderr : undefined,
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

  // Never treat the per-event `status` field as end-of-stream.
  // SSE/pull catch-up stamps the *current* run status onto every historical
  // event — so after a fast finish, `session_resumed` arrives with
  // status=completed and would drop all later assistant_message/error events.
  return "continue";
}

async function runAgentChatViaStream(opts: {
  sidecar: SidecarInfo;
  sessionId: string;
  runId: string;
  onEvent: (event: AgentUiEvent) => void;
  onAskUser: AskUserHandler;
  onApproval: ApprovalHandler;
  onToolExec?: ToolExecCallbacks & {
    onStart?: (info: { callId: string; command: string; intent?: string }) => void;
    onDone?: (info: {
      callId: string;
      ok: boolean;
      exitCode?: number | null;
      error?: string;
      stdout?: string;
      stderr?: string;
    }) => void;
  };
  signal?: AbortSignal;
}): Promise<void> {
  const { sidecar, sessionId, runId, onEvent, onAskUser, onApproval, onToolExec, signal } = opts;
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
            onToolExec,
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
  onToolExec?: ToolExecCallbacks & {
    onStart?: (info: { callId: string; command: string; intent?: string }) => void;
    onDone?: (info: {
      callId: string;
      ok: boolean;
      exitCode?: number | null;
      error?: string;
      stdout?: string;
      stderr?: string;
    }) => void;
  };
  signal?: AbortSignal;
}): Promise<void> {
  const { sidecar, sessionId, runId, onEvent, onAskUser, onApproval, onToolExec, signal } = opts;
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
        onToolExec,
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
  engineerMode?: "linux" | "k8s";
  clusterId?: string;
  clusterName?: string;
  clusterTarget?: K8sClusterTarget;
  securityMode?: string;
  serverId?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Prefer seeding from a prior sidecar SessionLog (tool results preserved). */
  resumeRunId?: string | null;
  interactionMode?: string;
  attachments?: Array<Record<string, unknown>>;
  onEvent: (event: AgentUiEvent) => void;
  onAskUser: AskUserHandler;
  onApproval: ApprovalHandler;
  onToolExec?: ToolExecCallbacks & {
    onStart?: (info: { callId: string; command: string; intent?: string }) => void;
    onDone?: (info: {
      callId: string;
      ok: boolean;
      exitCode?: number | null;
      error?: string;
      stdout?: string;
      stderr?: string;
    }) => void;
  };
  signal?: AbortSignal;
}): Promise<{ runId: string; resumedFrom?: string | null }> {
  const {
    sidecar,
    sessionId,
    message,
    engineerMode,
    clusterId,
    clusterName,
    clusterTarget,
    securityMode,
    serverId,
    history,
    resumeRunId,
    interactionMode,
    attachments,
    onEvent,
    onAskUser,
    onApproval,
    onToolExec,
    signal,
  } = opts;

  const metadata: Record<string, unknown> = {
    engineer_mode: engineerMode ?? "linux",
  };
  if (clusterId) metadata.cluster_id = clusterId;
  if (clusterName) metadata.cluster_name = clusterName;
  if (clusterTarget) metadata.cluster_target = clusterTarget;

  const startRes = await sidecarFetch(sidecar, "/v1/chat/start", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      message,
      metadata,
      security_mode: securityMode ?? null,
      interaction_mode: interactionMode ?? null,
      server_id: serverId ?? null,
      history: history ?? [],
      resume_run_id: resumeRunId || null,
      attachments: attachments ?? [],
    }),
    signal,
  });
  if (!startRes.ok) {
    throw new Error(`chat start failed: ${startRes.status} ${await startRes.text()}`);
  }
  const startJson = (await startRes.json()) as {
    run_id?: string;
    status?: string;
    resumed_from?: string | null;
  };
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
        onToolExec,
        signal,
      });
      return { runId, resumedFrom: startJson.resumed_from ?? null };
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
    onToolExec,
    signal,
  });
  return { runId, resumedFrom: startJson.resumed_from ?? null };
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
