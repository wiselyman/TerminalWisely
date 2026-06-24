export interface CommonPortPreset {
  id: string;
  port: string;
  label: string;
  hint: string;
  group: string;
}

export const COMMON_PORT_PRESETS: CommonPortPreset[] = [
  { id: "22", port: "22", label: "SSH", hint: "远程登录", group: "常用服务" },
  { id: "80", port: "80", label: "HTTP", hint: "网站 80 端口", group: "常用服务" },
  { id: "443", port: "443", label: "HTTPS", hint: "网站 443 端口", group: "常用服务" },
  { id: "3306", port: "3306", label: "MySQL", hint: "数据库", group: "数据库" },
  { id: "5432", port: "5432", label: "PostgreSQL", hint: "数据库", group: "数据库" },
  { id: "6379", port: "6379", label: "Redis", hint: "缓存", group: "数据库" },
  { id: "8080", port: "8080", label: "8080", hint: "常见应用端口", group: "应用" },
  { id: "9000", port: "9000", label: "9000", hint: "常见应用端口", group: "应用" },
];

export function isValidPort(value: string): boolean {
  const n = Number(value.trim());
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

export function groupPortPresets(): { group: string; items: CommonPortPreset[] }[] {
  const groups = new Map<string, CommonPortPreset[]>();
  for (const preset of COMMON_PORT_PRESETS) {
    const list = groups.get(preset.group) ?? [];
    list.push(preset);
    groups.set(preset.group, list);
  }
  return [...groups.entries()].map(([group, items]) => ({ group, items }));
}

export function describePort(value: string, optional = false): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return optional ? "留空表示查看全部监听端口" : "请点选常见端口，或在下方输入端口号";
  }
  if (!isValidPort(trimmed)) return "端口号应为 1–65535 之间的整数";
  const preset = COMMON_PORT_PRESETS.find((item) => item.port === trimmed);
  if (preset) return `端口 ${trimmed}（${preset.label} · ${preset.hint}）`;
  return `端口 ${trimmed}`;
}
