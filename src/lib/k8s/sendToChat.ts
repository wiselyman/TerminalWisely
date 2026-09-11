import type { K8sWarningEvent } from "./types";

const CLIP_CHARS = 12_000;

function clipText(text: string): string {
  if (text.length <= CLIP_CHARS) return text;
  return `${text.slice(-CLIP_CHARS)}\n…(truncated)`;
}

/** Prompt when sending a selected K8s resource to AI chat. */
export function k8sResourceChatPrompt(opts: {
  kind: string;
  namespace: string;
  name: string;
  phase: string;
  analyze: (vars: Record<string, string>) => string;
}): string {
  return opts.analyze({
    kind: opts.kind,
    namespace: opts.namespace,
    name: opts.name,
    phase: opts.phase,
  });
}

/** Prompt when sending a cluster warning/event to AI chat. */
export function k8sWarningChatPrompt(
  ev: K8sWarningEvent,
  t: (key: string, vars?: Record<string, string>) => string,
): string {
  const target = [
    ev.kind,
    ev.namespace ? `${ev.namespace}/${ev.name}` : ev.name,
  ]
    .filter(Boolean)
    .join(" ");
  return t("aiEngineerWarningPrompt", {
    reason: ev.reason || "Warning",
    target: target || "unknown",
    message: ev.message || "",
  });
}

/** Prompt when sending resource logs to AI chat. */
export function k8sLogsChatPrompt(opts: {
  kind: string;
  namespace: string;
  name: string;
  container?: string;
  logs: string;
  t: (key: string, vars?: Record<string, string>) => string;
}): string {
  return opts.t("aiEngineerLogsPrompt", {
    kind: opts.kind,
    namespace: opts.namespace,
    name: opts.name,
    container: opts.container || "-",
    logs: clipText(opts.logs) || "(empty)",
  });
}

/** Prompt when sending resource YAML to AI chat. */
export function k8sYamlChatPrompt(opts: {
  kind: string;
  namespace: string;
  name: string;
  yaml: string;
  t: (key: string, vars?: Record<string, string>) => string;
}): string {
  return opts.t("aiEngineerYamlPrompt", {
    kind: opts.kind,
    namespace: opts.namespace,
    name: opts.name,
    yaml: clipText(opts.yaml) || "(empty)",
  });
}

/** Prompt when sending an apply/delete/shell error to AI chat. */
export function k8sErrorChatPrompt(opts: {
  operation: string;
  error: string;
  t: (key: string, vars?: Record<string, string>) => string;
}): string {
  return opts.t("aiEngineerErrorPrompt", {
    operation: opts.operation,
    error: opts.error || "(unknown error)",
  });
}

/** Prompt when sending overview health / aggregated warnings to AI chat. */
export function k8sHealthChatPrompt(opts: {
  warnings: K8sWarningEvent[];
  notReadyNodes?: number;
  t: (key: string, vars?: Record<string, string | number>) => string;
}): string {
  const lines = opts.warnings.slice(0, 12).map((ev) => {
    const target = [
      ev.kind,
      ev.namespace ? `${ev.namespace}/${ev.name}` : ev.name,
    ]
      .filter(Boolean)
      .join(" ");
    return `- ${ev.reason || "Warning"} on ${target || "unknown"}: ${ev.message || ""}`;
  });
  const summary =
    lines.length > 0
      ? lines.join("\n")
      : opts.notReadyNodes
        ? `(${opts.notReadyNodes} node(s) not Ready)`
        : "(no warning details)";
  return opts.t("aiEngineerHealthPrompt", {
    count: opts.warnings.length,
    nodes: opts.notReadyNodes ?? 0,
    summary,
  });
}

/** Prompt when sending terminal selection to AI chat. */
export function k8sSelectionChatPrompt(opts: {
  source: string;
  text: string;
  t: (key: string, vars?: Record<string, string>) => string;
}): string {
  return opts.t("aiEngineerSelectionPrompt", {
    source: opts.source,
    text: clipText(opts.text.replace(/\x00/g, "").trim()) || "(empty)",
  });
}
