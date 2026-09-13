import { isSudoRequiredError } from "../stores/previewStore";
import {
  extractActionFromSudoError,
  extractPathFromSudoError,
  requestSudoPassword,
  SUDO_CANCELLED,
} from "../stores/sudoPromptStore";

const MAX_SUDO_PROMPTS = 2;

export type SudoRetryOptions = {
  action?: string;
  path?: string;
  command?: string;
  /**
   * Shared across a batch (multi-move / paste). Seed with a known password and
   * read back after success so later items skip the prompt.
   */
  passwordRef?: { current?: string };
};

export async function invokeWithSudoRetry<T>(
  run: (sudoPassword?: string) => Promise<T>,
  fallback?: SudoRetryOptions,
): Promise<T> {
  let password: string | undefined = fallback?.passwordRef?.current;
  let prompts = 0;
  for (;;) {
    try {
      const result = await run(password);
      if (password && fallback?.passwordRef) {
        fallback.passwordRef.current = password;
      }
      return result;
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
      if (fallback?.passwordRef) {
        fallback.passwordRef.current = password;
      }
    }
  }
}
