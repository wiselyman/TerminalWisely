import i18n from "../i18n";
import { formatAppError } from "./formatAppError";

function extractMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "";
}

/** Backend/ssh2 errors sometimes surface in English before reaching AppError. */
const ENGLISH_PATTERNS: Array<{ match: RegExp; key: string }> = [
  { match: /authentication/i, key: "errors:authFailed" },
  { match: /password is required/i, key: "errors:passwordRequired" },
  { match: /connection refused|actively refused/i, key: "errors:connectionRefused" },
  { match: /timed out|timeout/i, key: "errors:connectionTimeout" },
  { match: /no route to host|network is unreachable/i, key: "errors:networkUnreachable" },
];

export function formatConnectError(err: unknown): string {
  const message = extractMessage(err);
  if (!message) return i18n.t("errors:connectFailed");

  for (const { match, key } of ENGLISH_PATTERNS) {
    if (match.test(message)) return i18n.t(key);
  }

  return formatAppError(message);
}
