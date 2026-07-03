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
  return message;
}
