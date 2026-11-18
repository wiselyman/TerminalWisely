import { listen } from "@tauri-apps/api/event";
import { formatAppError } from "../formatAppError";
import { interpretReadProbeOutcome } from "./readProbeOutcome";
import { invokeWithSudoRetry } from "../invokeWithSudoRetry";
import { aiLocalExec, aiRegisterPrivilegeLease, aiTerminalExec } from "./api";
import { LOCAL_CHAT_SESSION, terminalExecCommand } from "./localTarget";
import {
  interactivePasswordError,
  looksLikeInteractivePasswordPrompt,
  looksLikeSudoPasswordNeeded,
  sudoRequiredError,
} from "./sudoOutput";

export type ToolCallEvent = {
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
  requires_lease?: boolean;
  policy?: { approved?: boolean };
  lease?: {
    lease_id: string;
    session_id: string;
    command: string;
    expires_at_epoch_s: number;
    max_executions?: number;
  } | null;
  target?: string | null;
};

export type ToolExecCallbacks = {
  onOutput?: (info: {
    callId: string;
    stream: "stdout" | "stderr";
    chunk: string;
  }) => void;
};

type AiExecOutputPayload = {
  call_id: string;
  stream: string;
  chunk: string;
};

function commandLooksLikeSudo(command: string): boolean {
  return /^\s*sudo\b/i.test(command);
}

export async function executeToolCall(
  sessionId: string,
  call: ToolCallEvent,
  callbacks?: ToolExecCallbacks,
): Promise<Record<string, unknown>> {
  if (call.name === "terminal_exec" || call.name === "ai_exec") {
    const command = String(call.arguments.command ?? "").trim();
    if (!command) {
      return { ok: false, error: "empty command" };
    }
    const hostSessionId = sessionId;
    const unlisten =
      callbacks?.onOutput && call.call_id
        ? await listen<AiExecOutputPayload>("ai-exec-output", (event) => {
            if (event.payload.call_id !== call.call_id) return;
            const stream =
              event.payload.stream === "stderr" ? "stderr" : "stdout";
            callbacks.onOutput?.({
              callId: call.call_id,
              stream,
              chunk: event.payload.chunk,
            });
          })
        : undefined;
    try {
      let leaseId: string | undefined;
      const requiresLease = Boolean(call.requires_lease || call.lease);
      const local = terminalExecCommand(hostSessionId, call.target) === "ai_local_exec";
      const leaseSessionId = local
        ? LOCAL_CHAT_SESSION
        : call.lease?.session_id || hostSessionId;
      if (call.lease?.lease_id) {
        await aiRegisterPrivilegeLease({
          leaseId: call.lease.lease_id,
          sessionId: leaseSessionId,
          command: call.lease.command || command,
          expiresAtEpochS: Number(call.lease.expires_at_epoch_s),
          maxExecutions: call.lease.max_executions ?? 1,
        });
        leaseId = call.lease.lease_id;
      } else if (requiresLease) {
        return {
          ok: false,
          error: "mutation requires privilege lease from approval",
          _untrusted: true,
        };
      }
      const result = await invokeWithSudoRetry(
        (sudoPassword) =>
          (local
            ? aiLocalExec({
                command,
                callId: call.call_id,
                leaseId,
                requiresLease,
              })
            : aiTerminalExec({
            sessionId: hostSessionId,
            command,
            callId: call.call_id,
            leaseId,
            requiresLease,
            sudo: commandLooksLikeSudo(command) || Boolean(sudoPassword),
            sudoPassword,
          })).then((res) => {
            // Pipeline exit 0 can still print "sudo: 需要密码" when sudo was
            // not peeled; treat as auth failure so the password modal opens.
            const combined = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
            if (looksLikeSudoPasswordNeeded(combined)) {
              throw sudoRequiredError(command);
            }
            if (looksLikeInteractivePasswordPrompt(combined)) {
              throw interactivePasswordError(command);
            }
            return res;
          }),
        { action: "执行", command },
      );
      const exitCode =
        typeof result.exit_code === "number" ? result.exit_code : 1;
      const timedOut = Boolean(result.timed_out);
      const outcome = interpretReadProbeOutcome({
        exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut,
      });
      if (outcome.kind === "ok") {
        return {
          ok: true,
          stdout: result.stdout,
          stderr: result.stderr,
          exit_code: exitCode,
          timed_out: timedOut,
          _untrusted: true,
        };
      }
      if (outcome.kind === "filter_no_match") {
        return {
          ok: true,
          stdout: result.stdout,
          stderr: result.stderr,
          exit_code: exitCode,
          timed_out: timedOut,
          filter_no_match: true,
          _note: outcome.note,
          _untrusted: true,
        };
      }
      return {
        ok: false,
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: exitCode,
        timed_out: timedOut,
        error: outcome.error,
        _untrusted: true,
      };
    } catch (err) {
      return { ok: false, error: formatAppError(err), _untrusted: true };
    } finally {
      await unlisten?.();
    }
  }
  return { ok: false, error: `unsupported host tool: ${call.name}` };
}
