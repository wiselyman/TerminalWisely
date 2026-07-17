import i18n from "../i18n";

function replaceMarker(data: string, marker: string, text: string): string {
  return data.includes(marker) ? data.split(marker).join(text) : data;
}

/** Translate backend TW_STATUS:* markers inside terminal-output chunks. */
export function localizeTerminalOutputChunk(data: string): string {
  if (!data.includes("TW_STATUS:")) return data;
  return replaceMarker(
    replaceMarker(
      replaceMarker(
        data,
        "TW_STATUS:RECONNECTING",
        i18n.t("terminal:statusReconnecting"),
      ),
      "TW_STATUS:SHELL_RECONNECTING",
      i18n.t("terminal:statusShellReconnecting"),
    ),
    "TW_STATUS:DISCONNECTED",
    i18n.t("terminal:statusDisconnected"),
  );
}
