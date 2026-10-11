export type McpPlatform = "darwin" | "win32" | "linux";

export type McpCatalogEntry = {
  id: string;
  category: "desktop" | "browser" | "office" | "cad" | "collab" | "dev";
  /** Display name (English; UI may translate via i18n key mcpCatalog.<id>). */
  name: string;
  summary: string;
  platforms: McpPlatform[];
  /** Package / binary install steps for the agent (shell-oriented). */
  installSteps: string[];
  register: {
    name: string;
    command: string;
    args: string[];
    /** Env keys the user may fill before Install. */
    envKeys?: string[];
  };
  docsUrl: string;
};

export type McpCatalogListed = McpCatalogEntry & { installable: boolean };

export const USER_MCP_CONFIG_PATH =
  "~/.terminalwisely/ai-engineer/user_mcp.json";

export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    id: "open-computer-use",
    category: "desktop",
    name: "Open Computer Use",
    summary: "Click, type, and inspect desktop apps via accessibility.",
    platforms: ["darwin", "win32", "linux"],
    installSteps: [
      "Ensure Node.js is available.",
      "Run: npm i -g @opensymph/open-computer-use",
      "On macOS, grant Accessibility and Screen Recording if prompted (ocu doctor).",
    ],
    register: {
      name: "open-computer-use",
      command: "ocu",
      args: [],
    },
    docsUrl: "https://github.com/opensymph/open-computer-use",
  },
  {
    id: "windows-mcp",
    category: "desktop",
    name: "Windows-MCP",
    summary: "Windows UI automation (UIA), windows, and input.",
    platforms: ["win32"],
    installSteps: [
      "Ensure uv (Astral) is installed: https://github.com/astral-sh/uv",
      "Register with uvx so the first run fetches the package.",
    ],
    register: {
      name: "windows-mcp",
      command: "uvx",
      args: ["windows-mcp", "serve"],
    },
    docsUrl: "https://github.com/CursorTouch/Windows-MCP",
  },
  {
    id: "computer-use-linux",
    category: "desktop",
    name: "computer-use-linux",
    summary: "Linux desktop control (AT-SPI / Wayland-first).",
    platforms: ["linux"],
    installSteps: [
      "Install the computer-use-linux binary from its GitHub releases for this CPU.",
      "Put computer-use-linux on PATH.",
    ],
    register: {
      name: "computer-use-linux",
      command: "computer-use-linux",
      args: ["mcp"],
    },
    docsUrl: "https://github.com/agent-sh/computer-use-linux",
  },
  {
    id: "playwright",
    category: "browser",
    name: "Playwright MCP",
    summary: "Drive a real browser: navigate, click, type, tabs.",
    platforms: ["darwin", "win32", "linux"],
    installSteps: [
      "Ensure Node.js / npx is available.",
      "First launch via npx will download @playwright/mcp and browsers as needed.",
    ],
    register: {
      name: "playwright",
      command: "npx",
      args: ["-y", "@playwright/mcp@latest"],
    },
    docsUrl: "https://github.com/microsoft/playwright-mcp",
  },
  {
    id: "office-files",
    category: "office",
    name: "office-mcp (files)",
    summary: "Read/edit .docx / .xlsx / .pptx files (no live Office COM).",
    platforms: ["darwin", "win32", "linux"],
    installSteps: [
      "Clone https://github.com/gawirable/office-mcp and install its Python deps in a venv.",
      "Register python pointing at that repo's server.py absolute path.",
    ],
    register: {
      name: "office-files",
      command: "python",
      args: ["server.py"],
    },
    docsUrl: "https://github.com/gawirable/office-mcp",
  },
  {
    id: "officemcp",
    category: "office",
    name: "OfficeMCP",
    summary: "Automate installed Microsoft Office / WPS via Windows COM.",
    platforms: ["win32"],
    installSteps: [
      "Ensure uv is installed.",
      "Register uvx officemcp (fetches on first run).",
    ],
    register: {
      name: "OfficeMCP",
      command: "uvx",
      args: ["officemcp"],
    },
    docsUrl: "https://github.com/officemcp/officemcp",
  },
  {
    id: "wps-office",
    category: "office",
    name: "WPS Office MCP",
    summary: "WPS Writer / Calc / Impress automation on Windows.",
    platforms: ["win32"],
    installSteps: [
      "Install WPS Office on this PC.",
      "Clone https://github.com/hanmirage/wps-office-mcp and install Python deps.",
      "Register: python -m wps_controller.mcp_server",
    ],
    register: {
      name: "wps-office",
      command: "python",
      args: ["-m", "wps_controller.mcp_server"],
    },
    docsUrl: "https://github.com/hanmirage/wps-office-mcp",
  },
  {
    id: "multicad",
    category: "cad",
    name: "multiCAD-mcp",
    summary: "AutoCAD / ZWCAD / GstarCAD / BricsCAD via Windows COM.",
    platforms: ["win32"],
    installSteps: [
      "Install a supported CAD app.",
      "Clone https://github.com/AnCode666/multiCAD-mcp and follow its Python setup.",
      "Register the repo's Python MCP entry with an absolute path.",
    ],
    register: {
      name: "multiCAD",
      command: "python",
      args: ["src/main.py"],
    },
    docsUrl: "https://github.com/AnCode666/multiCAD-mcp",
  },
  {
    id: "feishu",
    category: "collab",
    name: "Feishu / Lark OpenAPI MCP",
    summary: "Official Feishu/Lark docs, messages, calendar, bitable (API).",
    platforms: ["darwin", "win32", "linux"],
    installSteps: [
      "Create a Feishu/Lark app and collect App ID + App Secret.",
      "Ensure Node.js / npx is available.",
    ],
    register: {
      name: "lark-mcp",
      command: "npx",
      args: [
        "-y",
        "@larksuiteoapi/lark-mcp",
        "mcp",
        "-a",
        "${APP_ID}",
        "-s",
        "${APP_SECRET}",
      ],
      envKeys: ["APP_ID", "APP_SECRET"],
    },
    docsUrl: "https://github.com/larksuite/lark-openapi-mcp",
  },
  {
    id: "dingtalk",
    category: "collab",
    name: "DingTalk MCP",
    summary: "Official DingTalk contacts, todos, calendar, notices (API).",
    platforms: ["darwin", "win32", "linux"],
    installSteps: [
      "Create a DingTalk app; collect Client ID + Client Secret.",
      "Ensure Node.js / npx is available.",
    ],
    register: {
      name: "dingtalk-mcp",
      command: "npx",
      args: ["-y", "dingtalk-mcp@latest"],
      envKeys: ["DINGTALK_Client_ID", "DINGTALK_Client_Secret"],
    },
    docsUrl: "https://github.com/open-dingtalk/dingtalk-mcp",
  },
  {
    id: "wecom",
    category: "collab",
    name: "WeCom MCP",
    summary: "WeCom app messages or group webhook.",
    platforms: ["darwin", "win32", "linux"],
    installSteps: [
      "Prepare WeCom webhook key and/or corp credentials.",
      "Ensure Node.js / npx is available.",
    ],
    register: {
      name: "wecom",
      command: "npx",
      args: ["-y", "@china-mcp/wecom-mcp"],
      envKeys: ["WECOM_WEBHOOK_KEY", "WECOM_CORP_ID", "WECOM_CORP_SECRET", "WECOM_AGENT_ID"],
    },
    docsUrl: "https://github.com/huanglei288766/china-mcp-servers",
  },
  {
    id: "notion",
    category: "collab",
    name: "Notion MCP (remote)",
    summary: "Official hosted Notion MCP via mcp-remote.",
    platforms: ["darwin", "win32", "linux"],
    installSteps: ["Ensure Node.js / npx is available.", "Complete OAuth when prompted."],
    register: {
      name: "notion",
      command: "npx",
      args: ["-y", "mcp-remote", "https://mcp.notion.com/mcp"],
    },
    docsUrl: "https://github.com/makenotion/notion-mcp-server",
  },
  {
    id: "slack",
    category: "collab",
    name: "Slack MCP (remote)",
    summary: "Official hosted Slack MCP via mcp-remote.",
    platforms: ["darwin", "win32", "linux"],
    installSteps: ["Ensure Node.js / npx is available.", "Complete Slack admin approval / OAuth."],
    register: {
      name: "slack",
      command: "npx",
      args: ["-y", "mcp-remote", "https://mcp.slack.com/mcp"],
    },
    docsUrl: "https://docs.slack.dev/ai/mcp-server",
  },
  {
    id: "linear",
    category: "collab",
    name: "Linear MCP (remote)",
    summary: "Official hosted Linear MCP via mcp-remote.",
    platforms: ["darwin", "win32", "linux"],
    installSteps: ["Ensure Node.js / npx is available.", "Complete OAuth when prompted."],
    register: {
      name: "linear",
      command: "npx",
      args: ["-y", "mcp-remote", "https://mcp.linear.app/mcp"],
    },
    docsUrl: "https://linear.app/docs/mcp",
  },
  {
    id: "github",
    category: "dev",
    name: "GitHub MCP (remote)",
    summary: "Official GitHub MCP via mcp-remote.",
    platforms: ["darwin", "win32", "linux"],
    installSteps: [
      "Ensure Node.js / npx is available.",
      "Authenticate with GitHub when prompted.",
    ],
    register: {
      name: "github",
      command: "npx",
      args: ["-y", "mcp-remote", "https://api.githubcopilot.com/mcp/"],
    },
    docsUrl: "https://github.com/github/github-mcp-server",
  },
];

export function listMcpCatalogForPlatform(
  platform: McpPlatform,
): McpCatalogListed[] {
  const withFlag = MCP_CATALOG.map((entry) => ({
    ...entry,
    installable: entry.platforms.includes(platform),
  }));
  return [
    ...withFlag.filter((e) => e.installable),
    ...withFlag.filter((e) => !e.installable),
  ];
}

export function detectMcpPlatform(platform?: string): McpPlatform {
  if (platform === "darwin" || platform === "win32" || platform === "linux") {
    return platform;
  }
  if (typeof navigator !== "undefined") {
    const ua = `${navigator.userAgent} ${navigator.platform || ""}`;
    if (/Mac|iPhone|iPad/i.test(ua)) return "darwin";
    if (/Win/i.test(ua)) return "win32";
  }
  return "linux";
}

function substituteArgs(args: string[], env: Record<string, string>): string[] {
  return args.map((part) =>
    part.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key: string) => env[key] ?? part),
  );
}

export function buildMcpInstallPrompt(
  entry: McpCatalogEntry,
  opts: {
    locale?: "en" | "zh";
    env?: Record<string, string>;
    /** Absolute path preferred; falls back to the documented home path. */
    configPath?: string;
  } = {},
): string {
  const locale = opts.locale === "zh" ? "zh" : "en";
  const env = opts.env ?? {};
  const configPath = (opts.configPath || "").trim() || USER_MCP_CONFIG_PATH;
  const args = substituteArgs(entry.register.args, env);
  const envBlock =
    Object.keys(env).length > 0
      ? JSON.stringify(env, null, 2)
      : entry.register.envKeys?.length
        ? `(ask_user for: ${entry.register.envKeys.join(", ")})`
        : "{}";
  const serverSpec = {
    [entry.register.name]: {
      command: entry.register.command,
      args,
      ...(Object.keys(env).length ? { env } : {}),
    },
  };

  if (locale === "zh") {
    return [
      `请在这台电脑上安装并登记 MCP 服务器「${entry.name}」。`,
      `用途：${entry.summary}`,
      `文档：${entry.docsUrl}`,
      "",
      "安装步骤：",
      ...entry.installSteps.map((s, i) => `${i + 1}. ${s}`),
      "",
      `装好后，合并写入 ${configPath}（JSON，键 mcpServers），至少包含：`,
      "```json",
      JSON.stringify({ mcpServers: serverSpec }, null, 2),
      "```",
      `环境变量参考：${envBlock}`,
      "",
      "用 terminal_exec 执行安装（变更需用户批准）。不要声称设置界面已经装好。",
      "完成后读配置验证已登记，并简短说明下一步如何试用。",
      "若缺少密钥，用 ask_user 索取，不要编造。",
    ].join("\n");
  }

  return [
    `Install and register the MCP server "${entry.name}" on this computer.`,
    `Purpose: ${entry.summary}`,
    `Docs: ${entry.docsUrl}`,
    "",
    "Install steps:",
    ...entry.installSteps.map((s, i) => `${i + 1}. ${s}`),
    "",
    `After install, merge into ${configPath} (JSON key mcpServers) at least:`,
    "```json",
    JSON.stringify({ mcpServers: serverSpec }, null, 2),
    "```",
    `Env reference: ${envBlock}`,
    "",
    "Use terminal_exec for installs (mutations need user approval). Do not claim Settings already installed it.",
    "When done, verify the config and briefly say how to try the new tools.",
    "If secrets are missing, ask_user — do not invent them.",
  ].join("\n");
}
