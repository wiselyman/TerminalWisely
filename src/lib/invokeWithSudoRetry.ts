import { isSudoRequiredError } from "../stores/previewStore";
import {
  extractActionFromSudoError,
  extractPathFromSudoError,
  requestSudoPassword,
  SUDO_CANCELLED,
} from "../stores/sudoPromptStore";

const MAX_SUDO_PROMPTS = 2;

export async function invokeWithSudoRetry<T>(
  run: (sudoPassword?: string) => Promise<T>,
  fallback?: { action?: string; path?: string; command?: string },
): Promise<T> {
  let password: string | undefined;
  let prompts = 0;
  for (;;) {
    try {
      return await run(password);
    } catch (err) {
      const message = String(err);
      if (!isSudoRequiredError(message)) {
        throw err;
      }
      prompts += 1;
      if (prompts > MAX_SUDO_PROMPTS) {
        throw new Error(
          `${SUDO_CANCELLED}: sudo password rejected or privilege still required after ${MAX_SUDO_PROMPTS} attempts`,
        );
      }
      const detail =
        fallback?.command ?? fallback?.path ?? extractPathFromSudoError(message);
      password = await requestSudoPassword({
        action: fallback?.action ?? extractActionFromSudoError(message),
        path: detail,
        command: fallback?.command ?? detail,
      });
    }
  }
}
