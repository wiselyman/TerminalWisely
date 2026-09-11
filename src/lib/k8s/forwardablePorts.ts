/** Discover forwardable ports from kubectl YAML/JSON for Pod / Service. */

import type { PortForwardInfo } from "./types";

export type ForwardablePort = {
  remotePort: number;
  protocol: string;
  name?: string;
  targetPort?: string;
};

function normalizeKind(kind: string): "pod" | "service" | "other" {
  const k = kind.trim().toLowerCase();
  if (k === "pod") return "pod";
  if (k === "service" || k === "svc") return "service";
  return "other";
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function protocolOf(raw: unknown): string {
  if (typeof raw === "string" && raw.trim()) return raw.trim().toUpperCase();
  return "TCP";
}

function optionalName(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t || undefined;
}

function targetPortOf(raw: unknown): string | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return undefined;
}

function dedupSort(ports: ForwardablePort[]): ForwardablePort[] {
  const seen = new Set<string>();
  const out: ForwardablePort[] = [];
  for (const p of ports) {
    const key = `${p.remotePort}/${p.protocol.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      remotePort: p.remotePort,
      protocol: p.protocol.toUpperCase(),
      ...(p.name ? { name: p.name } : {}),
      ...(p.targetPort ? { targetPort: p.targetPort } : {}),
    });
  }
  out.sort(
    (a, b) =>
      a.remotePort - b.remotePort || a.protocol.localeCompare(b.protocol),
  );
  return out;
}

function portsFromPodJson(root: Record<string, unknown>): ForwardablePort[] {
  const spec = asRecord(root.spec);
  const containers = spec?.containers;
  if (!Array.isArray(containers)) return [];
  const out: ForwardablePort[] = [];
  for (const c of containers) {
    const crec = asRecord(c);
    const ports = crec?.ports;
    if (!Array.isArray(ports)) continue;
    for (const p of ports) {
      const prec = asRecord(p);
      const n = prec?.containerPort;
      if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) continue;
      out.push({
        remotePort: Math.trunc(n),
        protocol: protocolOf(prec?.protocol),
        name: optionalName(prec?.name),
      });
    }
  }
  return out;
}

function portsFromServiceJson(root: Record<string, unknown>): ForwardablePort[] {
  const spec = asRecord(root.spec);
  const ports = spec?.ports;
  if (!Array.isArray(ports)) return [];
  const out: ForwardablePort[] = [];
  for (const p of ports) {
    const prec = asRecord(p);
    const n = prec?.port;
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) continue;
    out.push({
      remotePort: Math.trunc(n),
      protocol: protocolOf(prec?.protocol),
      name: optionalName(prec?.name),
      targetPort: targetPortOf(prec?.targetPort),
    });
  }
  return out;
}

/** Collect fields for a YAML list item starting at `start` (line with `- `). */
function yamlListItemFields(
  lines: string[],
  start: number,
): { fields: Record<string, string>; end: number } {
  const startIndent = (lines[start].match(/^(\s*)/)?.[1].length ?? 0);
  const fields: Record<string, string> = {};
  const first = lines[start].replace(/^\s*-\s*/, "");
  const firstKv = first.match(/^([^:#]+):\s*(.*)$/);
  if (firstKv) {
    fields[firstKv[1].trim()] = firstKv[2].trim();
  }
  let i = start + 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (indent <= startIndent) break;
    const kv = line.match(/^\s*([^:#]+):\s*(.*)$/);
    if (!kv) continue;
    fields[kv[1].trim()] = kv[2].trim();
  }
  return { fields, end: i };
}

function portsFromYaml(doc: string, mode: "pod" | "service"): ForwardablePort[] {
  const lines = doc.split(/\r?\n/);
  const out: ForwardablePort[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*-\s/.test(line)) continue;
    // Heuristic: list item that declares containerPort or port
    if (mode === "pod" && !/containerPort:/.test(line) && i + 1 < lines.length) {
      // peek item body
      const { fields, end } = yamlListItemFields(lines, i);
      if (fields.containerPort) {
        const remotePort = Number.parseInt(fields.containerPort, 10);
        if (Number.isFinite(remotePort) && remotePort > 0) {
          out.push({
            remotePort,
            protocol: protocolOf(fields.protocol),
            name: optionalName(fields.name),
          });
        }
        i = end - 1;
        continue;
      }
    } else if (mode === "pod" && /containerPort:/.test(line)) {
      const { fields, end } = yamlListItemFields(lines, i);
      const remotePort = Number.parseInt(fields.containerPort ?? "", 10);
      if (Number.isFinite(remotePort) && remotePort > 0) {
        out.push({
          remotePort,
          protocol: protocolOf(fields.protocol),
          name: optionalName(fields.name),
        });
      }
      i = end - 1;
      continue;
    }

    if (mode === "service") {
      const { fields, end } = yamlListItemFields(lines, i);
      if (fields.port && !fields.containerPort) {
        // Skip non-port list items (e.g. selector entries accidentally) — require numeric port
        const remotePort = Number.parseInt(fields.port, 10);
        if (Number.isFinite(remotePort) && remotePort > 0) {
          out.push({
            remotePort,
            protocol: protocolOf(fields.protocol),
            name: optionalName(fields.name),
            targetPort: optionalName(fields.targetPort),
          });
        }
        i = end - 1;
      }
    }
  }
  return out;
}

/**
 * Parse forwardable ports from a kubectl `-o json` or `-o yaml` document.
 * Unsupported kinds / parse failures → [].
 */
export function parseForwardablePorts(doc: string, kind: string): ForwardablePort[] {
  const trimmed = doc.trim();
  if (!trimmed) return [];
  const mode = normalizeKind(kind);
  if (mode === "other") return [];

  if (trimmed.startsWith("{")) {
    try {
      const root = asRecord(JSON.parse(trimmed) as unknown);
      if (!root) return [];
      return dedupSort(
        mode === "pod" ? portsFromPodJson(root) : portsFromServiceJson(root),
      );
    } catch {
      return [];
    }
  }

  return dedupSort(portsFromYaml(trimmed, mode));
}

/** Prefer remotePort; bump while colliding with used local ports. */
export function suggestLocalPort(
  remotePort: number,
  usedLocalPorts: Iterable<number>,
): number {
  const used = new Set(
    [...usedLocalPorts].filter((n) => Number.isFinite(n) && n > 0),
  );
  let candidate = remotePort > 0 ? remotePort : 1;
  while (candidate <= 65535 && used.has(candidate)) {
    candidate += 1;
  }
  return candidate <= 65535 ? candidate : remotePort;
}

export function findActiveForward(
  forwards: PortForwardInfo[],
  opts: {
    resourceKind: string;
    namespace: string;
    name: string;
    remotePort: number;
  },
): PortForwardInfo | undefined {
  const kind = opts.resourceKind.trim().toLowerCase();
  return forwards.find(
    (pf) =>
      pf.resource_kind.trim().toLowerCase() === kind &&
      pf.namespace === opts.namespace &&
      pf.name === opts.name &&
      pf.remote_port === opts.remotePort,
  );
}

export function portRowKey(port: ForwardablePort): string {
  return `${port.remotePort}/${port.protocol.toUpperCase()}`;
}
