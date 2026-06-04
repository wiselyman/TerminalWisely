function extractMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "连接失败";
}

export function formatConnectError(err: unknown): string {
  const message = extractMessage(err);

  if (
    message.includes("SSH authentication failed") ||
    message.includes("密码错误或认证失败") ||
    /authentication/i.test(message)
  ) {
    return "密码错误或认证失败，请检查后重试";
  }
  if (message.includes("Password is required") || message.includes("请输入密码")) {
    return "请输入密码";
  }
  if (/connection refused|actively refused/i.test(message)) {
    return "无法连接到服务器，请检查主机和端口";
  }
  if (/timed out|timeout/i.test(message)) {
    return "连接超时，请检查网络或服务器地址";
  }
  if (/no route to host|network is unreachable/i.test(message)) {
    return "网络不可达，请检查网络连接";
  }

  return message;
}
