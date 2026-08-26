import { listen } from "@tauri-apps/api/event";
import { formatAppError } from "../formatAppError";
import { invokeWithSudoRetry } from "../invokeWithSudoRetry";
import {
  k8sApplyYaml,
  k8sDeleteResource,
  k8sGetResource,
  k8sKubectl,
  k8sListResources,
  k8sPodLogs,
  k8sScaleResource,
} from "../k8s/api";
import type { K8sClusterTarget, K8sResourceCategory } from "../k8s/types";
import { useK8sStore } from "../../stores/k8sStore";
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

function resolveClusterTarget(
  args: Record<string, unknown>,
): K8sClusterTarget | null {
  const fromArgs = args.cluster_target as K8sClusterTarget | undefined;
  if (fromArgs?.id) return fromArgs;
  return useK8sStore.getState().selectedCluster;
}

function toolResult(
  ok: boolean,
  stdout: string,
  stderr = "",
  exitCode: number | null = ok ? 0 : 1,
  error?: string,
): Record<string, unknown> {
  return {
    ok,
    stdout,
    stderr,
    exit_code: exitCode,
    ...(error ? { error } : {}),
    _untrusted: true,
  };
}

async function execK8sTool(
  call: ToolCallEvent,
): Promise<Record<string, unknown>> {
  const target = resolveClusterTarget(call.arguments);
  if (!target) {
    return { ok: false, error: "no cluster selected", _untrusted: true };
  }
  const args = call.arguments;
  const ns =
    typeof args.namespace === "string" && args.namespace.trim()
      ? args.namespace.trim()
      : target.namespace || "default";

  try {
    switch (call.name) {
      case "k8s_list": {
        const category = String(args.category ?? "pods") as K8sResourceCategory;
        const allNs = Boolean(args.all_namespaces);
        const rows = await k8sListResources(
          target,
          category,
          allNs ? null : ns,
        );
        return toolResult(true, JSON.stringify(rows, null, 2));
      }
      case "k8s_get":
      case "k8s_describe": {
        const kind = String(args.kind ?? "");
        const name = String(args.name ?? "");
        if (!kind || !name) {
          return { ok: false, error: "kind and name required", _untrusted: true };
        }
        if (call.name === "k8s_describe") {
          const res = await k8sKubectl(target, [
            "describe",
            kind.toLowerCase(),
            name,
            "-n",
            ns,
          ]);
          return toolResult(
            res.ok,
            res.stdout,
            res.stderr,
            res.exit_code,
            res.error ?? undefined,
          );
        }
        const detail = await k8sGetResource(target, kind, ns, name);
        return toolResult(true, JSON.stringify(detail, null, 2));
      }
      case "k8s_logs": {
        const pod = String(args.pod ?? args.name ?? "");
        const container =
          typeof args.container === "string" ? args.container : undefined;
        const tail =
          typeof args.tail_lines === "number" ? args.tail_lines : 200;
        const text = await k8sPodLogs(target, ns, pod, container, tail);
        return toolResult(true, text);
      }
      case "k8s_apply": {
        const yaml = String(args.yaml ?? "");
        if (!yaml.trim()) {
          return { ok: false, error: "yaml required", _untrusted: true };
        }
        const res = await k8sApplyYaml(target, yaml);
        return toolResult(
          res.ok,
          res.stdout,
          res.stderr,
          res.exit_code,
          res.error ?? undefined,
        );
      }
      case "k8s_delete": {
        const kind = String(args.kind ?? "");
        const name = String(args.name ?? "");
        const res = await k8sDeleteResource(target, kind, ns, name);
        return toolResult(
          res.ok,
          res.stdout,
          res.stderr,
          res.exit_code,
          res.error ?? undefined,
        );
      }
      case "k8s_scale": {
        const kind = String(args.kind ?? "deployment");
        const name = String(args.name ?? "");
        const replicas = Number(args.replicas ?? 1);
        const res = await k8sScaleResource(
          target,
          kind.toLowerCase(),
          ns,
          name,
          replicas,
        );
        return toolResult(
          res.ok,
          res.stdout,
          res.stderr,
          res.exit_code,
          res.error ?? undefined,
        );
      }
      case "k8s_exec": {
        const pod = String(args.pod ?? "");
        const container =
          typeof args.container === "string" ? args.container : undefined;
        const command = String(args.command ?? "").trim();
        if (!pod || !command) {
          return {
            ok: false,
            error: "pod and command required",
            _untrusted: true,
          };
        }
        const kubectlArgs = [
          "exec",
          pod,
          "-n",
          ns,
          ...(container ? ["-c", container] : []),
          "--",
          "sh",
          "-c",
          command,
        ];
        const res = await k8sKubectl(target, kubectlArgs);
        return toolResult(
          res.ok,
          res.stdout,
          res.stderr,
          res.exit_code,
          res.error ?? undefined,
        );
      }
      default:
        return {
          ok: false,
          error: `unsupported k8s tool: ${call.name}`,
          _untrusted: true,
        };
    }
  } catch (err) {
    return { ok: false, error: formatAppError(err), _untrusted: true };
  }
}

export async function executeToolCall(
  sessionId: string,
  call: ToolCallEvent,
  callbacks?: ToolExecCallbacks,
): Promise<Record<string, unknown>> {
  if (call.name.startsWith("k8s_")) {
    if (call.requires_lease && !call.lease?.lease_id) {
      return {
        ok: false,
        error: "mutation requires privilege lease from approval",
        _untrusted: true,
      };
    }
    return execK8sTool(call);
  }

  if (call.name === "terminal_exec" || call.name === "ai_exec") {
    const command = String(call.arguments.command ?? "").trim();
    if (!command) {
      return { ok: false, error: "empty command" };
    }
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

      const result = await invokeWithSudoRetry(
        (sudoPassword) =>
          aiTerminalExec({
            sessionId,
            command,
            callId: call.call_id,
            leaseId,
            requiresLease,
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
