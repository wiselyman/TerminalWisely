import { isSudoRequiredError } from "../stores/previewStore";
import {
  extractActionFromSudoError,
  extractPathFromSudoError,
  requestSudoPassword,
} from "../stores/sudoPromptStore";

export async function invokeWithSudoRetry<T>(
  run: (sudoPassword?: string) => Promise<T>,
  fallback?: { action?: string; path?: string },
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const message = String(err);
    if (!isSudoRequiredError(message)) {
      throw err;
    }
    const password = await requestSudoPassword({
      action: fallback?.action ?? extractActionFromSudoError(message),
      path: fallback?.path ?? extractPathFromSudoError(message),
    });
    return run(password);
  }
}
