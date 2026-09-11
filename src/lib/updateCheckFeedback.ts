/** Visible feedback for manual update checks (menu / settings). */

import { message } from "@tauri-apps/plugin-dialog";
import i18n from "../i18n";
import { isTauriRuntime } from "./isTauri";

type ManualCheckResult =
  | { status: "available" }
  | { status: "up-to-date"; version: string }
  | { status: "error"; message: string };

export async function showManualUpdateCheckResult(
  result: ManualCheckResult,
): Promise<void> {
  if (result.status === "available") return;

  const title = "TerminalWisely";
  if (result.status === "up-to-date") {
    const body = i18n.t("shell:updateUpToDate", { version: result.version });
    if (isTauriRuntime()) {
      await message(body, { title, kind: "info" });
    } else {
      window.alert(body);
    }
    return;
  }

  const detail = (result.message || "").trim();
  const body = detail
    ? i18n.t("shell:updateCheckFailedDetail", { detail })
    : i18n.t("shell:updateCheckFailed");
  if (isTauriRuntime()) {
    await message(body, { title, kind: "error" });
  } else {
    window.alert(body);
  }
}
