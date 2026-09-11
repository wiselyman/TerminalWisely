/** Detect remote sudo password prompts in command output (mirrors Rust preview_sudo). */

export function looksLikeSudoPasswordNeeded(text: string): boolean {
  const msg = text.toLowerCase();
  return (
    msg.includes("a password is required") ||
    msg.includes("a terminal is required") ||
    msg.includes("no tty present") ||
    msg.includes("no askpass") ||
    msg.includes("sorry, try again") ||
    msg.includes("incorrect password") ||
    msg.includes("authentication failure") ||
    msg.includes("需要密码") ||
    (msg.includes("密码") && msg.includes("sudo"))
  );
}

/**
 * Last-line looks like an interactive password prompt (su / login / sudo tty).
 * AI exec cannot type into these — fail fast instead of hanging.
 */
export function looksLikeInteractivePasswordPrompt(text: string): boolean {
  const last =
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .reverse()
      .find((l) => l.length > 0) ?? "";
  if (!last) return false;
  if (last === "密码：" || last === "密码:") return true;
  const lower = last.toLowerCase();
  if (lower === "password:") return true;
  if (lower.endsWith(" password:")) return true;
  if (lower.includes("password for ") && lower.endsWith(":")) return true;
  if (
    lower.endsWith("password:") &&
    (lower.includes("sudo") ||
      lower.includes("unix") ||
      lower.includes("'s ") ||
      lower.includes("’s "))
  ) {
    return true;
  }
  if (
    lower.startsWith("enter ") &&
    lower.includes("password") &&
    lower.endsWith(":")
  ) {
    return true;
  }
  return false;
}

export function sudoRequiredError(command: string): Error {
  return new Error(
    `PREVIEW_SUDO_REQUIRED: 执行 \`${command}\` 需要 sudo 权限，请确认命令并输入 sudo 密码`,
  );
}

export function interactivePasswordError(command: string): Error {
  return new Error(
    `AI_INTERACTIVE_PASSWORD: 命令 \`${command}\` 在等待交互式密码，AI 执行通道无法输入。请改用当前用户可直接执行的命令，或走可弹窗的 sudo。`,
  );
}
