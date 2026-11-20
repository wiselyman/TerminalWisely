export type ScriptShell = "unix" | "powershell";

function quotePosixShellArgument(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function quotePowerShellArgument(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function splitPath(path: string, shell: ScriptShell): { parent: string; basename: string } {
  const normalized = shell === "powershell" ? path.replace(/\//g, "\\") : path;
  const separator = shell === "powershell" ? "\\" : "/";
  const index = normalized.lastIndexOf(separator);
  if (index < 0) return { parent: ".", basename: normalized };
  const isDriveRootChild = shell === "powershell" && /^[a-z]:\\[^\\]+$/i.test(normalized);
  return {
    parent: index === 0 ? separator : isDriveRootChild ? normalized.slice(0, 3) : normalized.slice(0, index),
    basename: normalized.slice(index + 1),
  };
}

function parseShebang(line: string | null): { command: string; args: string[] } | null {
  if (!line?.startsWith("#!")) return null;
  const parts = line.slice(2).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return { command: parts[0], args: parts.slice(1) };
}

function windowsCommandFromShebang(shebang: { command: string; args: string[] }) {
  const basename = shebang.command.split(/[\\/]/).pop() ?? shebang.command;
  if (basename.toLowerCase() === "env" && shebang.args.length) {
    return { command: shebang.args[0], args: shebang.args.slice(1) };
  }
  return { command: basename, args: shebang.args };
}

function resolveRunner(
  path: string,
  permissions: string | null | undefined,
  shebang: string | null,
  shell: ScriptShell,
): { command: string; args: string[] } | null {
  const shebangCommand = parseShebang(shebang);
  if (shebangCommand) {
    return shell === "powershell"
      ? windowsCommandFromShebang(shebangCommand)
      : shebangCommand;
  }

  const extension = path.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase();
  if (extension === "sh") return { command: "bash", args: ["--"] };
  if (extension === "py") return shell === "powershell"
    ? { command: "py", args: ["-3"] }
    : { command: "python3", args: [] };
  if (shell === "unix" && permissions?.slice(1).includes("x")) {
    return { command: "./", args: [] };
  }
  if (shell === "powershell" && extension === "ps1") {
    return { command: "&", args: [] };
  }
  return null;
}

export function isRunnableScriptPath(
  path: string,
  permissions: string | null | undefined,
  shebang: string | null,
  shell: ScriptShell = "unix",
): boolean {
  return resolveRunner(path, permissions, shebang, shell) !== null;
}

export function buildRunScriptCommand(
  path: string,
  permissions: string | null | undefined,
  shebang: string | null,
  shell: ScriptShell,
): string | null {
  const runner = resolveRunner(path, permissions, shebang, shell);
  if (!runner) return null;
  const { parent, basename } = splitPath(path, shell);
  const scriptPath = shell === "powershell" ? `.\\${basename}` : `./${basename}`;
  if (runner.command === "./") {
    return `cd -- ${quotePosixShellArgument(parent)} && ${quotePosixShellArgument(scriptPath)}\r`;
  }
  if (runner.command === "&") {
    return `Set-Location -LiteralPath ${quotePowerShellArgument(parent)}; & ${quotePowerShellArgument(scriptPath)}\r`;
  }
  if (shell === "powershell") {
    const args = [...runner.args, scriptPath].map(quotePowerShellArgument).join(" ");
    return `Set-Location -LiteralPath ${quotePowerShellArgument(parent)}; & ${quotePowerShellArgument(runner.command)} ${args}\r`;
  }
  const args = [...runner.args, scriptPath].map(quotePosixShellArgument).join(" ");
  return `cd -- ${quotePosixShellArgument(parent)} && ${quotePosixShellArgument(runner.command)} ${args}\r`;
}
