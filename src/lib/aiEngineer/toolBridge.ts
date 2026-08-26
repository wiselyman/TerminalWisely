import { listen } from "@tauri-apps/api/event";
import { formatAppError } from "../formatAppError";
import { invokeWithSudoRetry } from "../invokeWithSudoRetry";
import { aiRegisterPrivilegeLease, aiTerminalExec } from "./api";

export type ToolCallEvent = {
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
  requires_lease?: boolean;
  lease?: {
    lease_id: string;
    session_id: string;
    command: string;
    expires_at_epoch_s: number;
    max_executions?: number;
  } | null;
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
    const unlisten =
      callbacks?.onOutput && call.call_id
        ? await listen<AiExecOutputPayload>("ai-exec-output", (event) => {
            if (event.payload.call_id !== call.call_id) return;
            const stream = event.payload.stream === "stderr" ? "stderr" : "stdout";
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
      if (call.lease?.lease_id) {
        await aiRegisterPrivilegeLease({
          leaseId: call.lease.lease_id,
          sessionId: call.lease.session_id || sessionId,
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

      // Sudo password goes through the host modal — never through chat ask_user.
      const result = await invokeWithSudoRetry(
        (sudoPassword) =>
          aiTerminalExec({
            sessionId,
            command,
            callId: call.call_id,
            leaseId,
            requiresLease,
            // Backend also auto-detects leading `sudo`; flag helps retries after modal.
            sudo: commandLooksLikeSudo(command) || Boolean(sudoPassword),
            sudoPassword,
          }),
        { action: "执行", command },
      );
      return {
        ok: true,
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exit_code,
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
