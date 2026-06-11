function extractMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "传输失败";
}

export function formatTransferError(err: unknown): string {
  let message = extractMessage(err).trim();
  message = message.replace(
    /Permission denied:\s*Permission denied/gi,
    "Permission denied",
  );

  if (/permission denied/i.test(message)) {
    const hint =
      "拖拽上传使用当前 SSH 用户通过 SFTP 写入，不会使用 sudo。根目录 / 以及 sudo 创建的目录通常只有 root 可写。";
    if (/无法上传到/.test(message)) {
      return `${message}\n${hint}\n可在服务器执行：sudo chown -R 用户名:用户名 目标目录`;
    }
    return `上传失败：目标目录无写入权限（${message}）。\n${hint}`;
  }

  return message;
}
