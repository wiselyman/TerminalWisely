export type SearchKeywordVariant = "package" | "file-content" | "filename";

export interface SearchKeywordPreset {
  id: string;
  label: string;
  value: string;
  hint: string;
  group: string;
}

export const PACKAGE_KEYWORD_PRESETS: SearchKeywordPreset[] = [
  { id: "nginx", label: "Nginx", value: "nginx", hint: "Web 服务器", group: "Web 与网络" },
  { id: "apache", label: "Apache", value: "apache", hint: "Web 服务器", group: "Web 与网络" },
  { id: "curl", label: "curl", value: "curl", hint: "命令行 HTTP 工具", group: "Web 与网络" },
  { id: "mysql", label: "MySQL", value: "mysql", hint: "数据库", group: "数据库" },
  { id: "postgres", label: "PostgreSQL", value: "postgres", hint: "数据库", group: "数据库" },
  { id: "redis", label: "Redis", value: "redis", hint: "缓存数据库", group: "数据库" },
  { id: "docker", label: "Docker", value: "docker", hint: "容器", group: "运维工具" },
  { id: "git", label: "Git", value: "git", hint: "版本控制", group: "开发工具" },
  { id: "python3", label: "Python 3", value: "python3", hint: "脚本语言", group: "开发工具" },
  { id: "node", label: "Node.js", value: "node", hint: "JavaScript 运行时", group: "开发工具" },
  { id: "java", label: "Java", value: "java", hint: "运行时", group: "开发工具" },
  { id: "vim", label: "Vim", value: "vim", hint: "文本编辑器", group: "常用工具" },
  { id: "htop", label: "htop", value: "htop", hint: "进程监控", group: "常用工具" },
  { id: "zip", label: "zip / unzip", value: "zip", hint: "压缩工具", group: "常用工具" },
];

export const FILE_CONTENT_PRESETS: SearchKeywordPreset[] = [
  {
    id: "error",
    label: "报错 / 异常",
    value: "error",
    hint: "日志或代码中的 error、failed",
    group: "日志排查",
  },
  {
    id: "warn",
    label: "警告信息",
    value: "warn",
    hint: "warning、WARN 等",
    group: "日志排查",
  },
  {
    id: "refused",
    label: "连接被拒",
    value: "refused",
    hint: "Connection refused",
    group: "日志排查",
  },
  {
    id: "timeout",
    label: "超时",
    value: "timeout",
    hint: "请求或连接超时",
    group: "日志排查",
  },
  {
    id: "permission",
    label: "权限不足",
    value: "Permission denied",
    hint: "Permission denied",
    group: "日志排查",
  },
  {
    id: "todo",
    label: "待办标记",
    value: "TODO",
    hint: "TODO、FIXME",
    group: "代码搜索",
  },
  {
    id: "password",
    label: "密码配置",
    value: "password",
    hint: "配置项中的 password",
    group: "代码搜索",
  },
  {
    id: "localhost",
    label: "本机地址",
    value: "127.0.0.1",
    hint: "127.0.0.1、localhost",
    group: "代码搜索",
  },
];

export const FILENAME_PRESETS: SearchKeywordPreset[] = [
  {
    id: "nginx.conf",
    label: "Nginx 配置",
    value: "nginx.conf",
    hint: "常见 Web 配置",
    group: "配置文件",
  },
  {
    id: "config",
    label: "配置文件",
    value: "config",
    hint: "名称含 config",
    group: "配置文件",
  },
  {
    id: "log",
    label: "日志文件",
    value: ".log",
    hint: "扩展名 .log",
    group: "配置文件",
  },
  {
    id: "env",
    label: "环境变量",
    value: ".env",
    hint: ".env 文件",
    group: "配置文件",
  },
  {
    id: "service",
    label: "systemd 单元",
    value: ".service",
    hint: "服务单元文件",
    group: "系统文件",
  },
  {
    id: "sh",
    label: "Shell 脚本",
    value: ".sh",
    hint: "脚本文件",
    group: "系统文件",
  },
];

export function presetsForVariant(variant: SearchKeywordVariant): SearchKeywordPreset[] {
  switch (variant) {
    case "package":
      return PACKAGE_KEYWORD_PRESETS;
    case "file-content":
      return FILE_CONTENT_PRESETS;
    case "filename":
      return FILENAME_PRESETS;
  }
}

export function findPreset(
  variant: SearchKeywordVariant,
  value: string,
): SearchKeywordPreset | undefined {
  return presetsForVariant(variant).find((preset) => preset.value === value.trim());
}

export function groupPresets(
  presets: SearchKeywordPreset[],
): { group: string; items: SearchKeywordPreset[] }[] {
  const groups = new Map<string, SearchKeywordPreset[]>();
  for (const preset of presets) {
    const list = groups.get(preset.group) ?? [];
    list.push(preset);
    groups.set(preset.group, list);
  }
  return [...groups.entries()].map(([group, items]) => ({ group, items }));
}

export function describeSearchKeyword(
  variant: SearchKeywordVariant,
  value: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    switch (variant) {
      case "package":
        return "请点选常见软件，或在下方输入要搜索的名称";
      case "file-content":
        return "请点选要查找的内容类型，或在下方输入关键词";
      case "filename":
        return "请点选常见文件类型，或在下方输入文件名片段";
    }
  }
  const preset = findPreset(variant, trimmed);
  if (preset) return `将搜索：${preset.label}（${preset.hint}）`;
  switch (variant) {
    case "package":
      return `将搜索名称含「${trimmed}」的软件包`;
    case "file-content":
      return `将在文件内容中查找「${trimmed}」`;
    case "filename":
      return `将查找文件名包含「${trimmed}」的文件`;
  }
}

export function variantSectionTitle(variant: SearchKeywordVariant): string {
  switch (variant) {
    case "package":
      return "常见软件";
    case "file-content":
      return "常见搜索";
    case "filename":
      return "常见文件";
  }
}

export function variantCustomLabel(variant: SearchKeywordVariant): string {
  switch (variant) {
    case "package":
      return "或输入软件名";
    case "file-content":
      return "或输入自定义关键词";
    case "filename":
      return "或输入文件名片段";
  }
}
