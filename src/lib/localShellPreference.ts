import i18n from "../i18n";

export const GIT_FOR_WINDOWS_URL = "https://git-scm.com/download/win";

export function gitBashInstallHint(): string {
  return i18n.t("errors:gitBashRequired");
}
