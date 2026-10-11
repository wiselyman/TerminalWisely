export type UserMcpServerConfig = {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
};

export function parseUserMcpConfig(text: string): UserMcpServerConfig[] {
  let payload: unknown;
  try {
    payload = JSON.parse(text || "{}");
  } catch {
    return [];
  }
  if (!payload || typeof payload !== "object") return [];
  const servers = (payload as { mcpServers?: unknown }).mcpServers;
  if (!servers || typeof servers !== "object") return [];
  const out: UserMcpServerConfig[] = [];
  for (const [name, spec] of Object.entries(servers as Record<string, unknown>)) {
    if (!spec || typeof spec !== "object") continue;
    const command = String((spec as { command?: unknown }).command || "").trim();
    if (!command) continue;
    const rawArgs = (spec as { args?: unknown }).args;
    const args = Array.isArray(rawArgs) ? rawArgs.map((a) => String(a)) : [];
    const rawEnv = (spec as { env?: unknown }).env;
    let env: Record<string, string> | undefined;
    if (rawEnv && typeof rawEnv === "object") {
      env = {};
      for (const [k, v] of Object.entries(rawEnv as Record<string, unknown>)) {
        if (v == null) continue;
        env[k] = String(v);
      }
      if (Object.keys(env).length === 0) env = undefined;
    }
    out.push({ name, command, args, env });
  }
  return out;
}

export function serializeUserMcpConfig(servers: UserMcpServerConfig[]): string {
  const mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }> =
    {};
  for (const s of servers) {
    if (!s.name.trim() || !s.command.trim()) continue;
    mcpServers[s.name] = {
      command: s.command,
      args: s.args ?? [],
      ...(s.env && Object.keys(s.env).length ? { env: s.env } : {}),
    };
  }
  return `${JSON.stringify({ mcpServers }, null, 2)}\n`;
}

export function mergeUserMcpServer(
  text: string,
  server: UserMcpServerConfig,
): string {
  const list = parseUserMcpConfig(text).filter((s) => s.name !== server.name);
  list.push(server);
  return serializeUserMcpConfig(list);
}

export function removeUserMcpServer(text: string, name: string): string {
  return serializeUserMcpConfig(
    parseUserMcpConfig(text).filter((s) => s.name !== name),
  );
}
