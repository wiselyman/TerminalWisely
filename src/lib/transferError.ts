import i18n from "../i18n";
import { formatAppError } from "./formatAppError";

function extractMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "";
}

export function formatTransferError(err: unknown): string {
  const message = extractMessage(err);
  if (!message) return i18n.t("errors:transferFailed");

  const formatted = formatAppError(message);
  return formatted
    .replace(/Permission denied:\s*Permission denied/gi, "Permission denied")
    .replace(/No such file:\s*No such file(?:\s+or directory)?/gi, "No such file")
    .trim();
}
