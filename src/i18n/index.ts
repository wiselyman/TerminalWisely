import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import commonZh from "./locales/zh-CN/common.json";
import shellZh from "./locales/zh-CN/shell.json";
import connectionZh from "./locales/zh-CN/connection.json";
import terminalZh from "./locales/zh-CN/terminal.json";
import previewZh from "./locales/zh-CN/preview.json";
import toolsZh from "./locales/zh-CN/tools.json";
import welcomeZh from "./locales/zh-CN/welcome.json";
import commandsZh from "./locales/zh-CN/commands.json";
import errorsZh from "./locales/zh-CN/errors.json";

import commonEn from "./locales/en/common.json";
import shellEn from "./locales/en/shell.json";
import connectionEn from "./locales/en/connection.json";
import terminalEn from "./locales/en/terminal.json";
import previewEn from "./locales/en/preview.json";
import toolsEn from "./locales/en/tools.json";
import welcomeEn from "./locales/en/welcome.json";
import commandsEn from "./locales/en/commands.json";
import errorsEn from "./locales/en/errors.json";

export const LOCALE_STORAGE_KEY = "terminal-wisely.locale";
export const SUPPORTED_LOCALES = ["zh-CN", "en"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

const NAMESPACES = [
  "common",
  "shell",
  "connection",
  "terminal",
  "preview",
  "tools",
  "welcome",
  "commands",
  "errors",
] as const;

function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === "zh-CN" || value === "en";
}

/** Chinese system → zh-CN; everything else → en. */
export function detectSystemLocale(): AppLocale {
  const candidates = [
    ...(navigator.languages ?? []),
    navigator.language,
  ].filter(Boolean);
  for (const tag of candidates) {
    if (tag.toLowerCase().startsWith("zh")) return "zh-CN";
  }
  return "en";
}

export function readStoredLocale(): AppLocale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isAppLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function resolveInitialLocale(): AppLocale {
  return readStoredLocale() ?? detectSystemLocale();
}

export function persistLocale(locale: AppLocale): void {
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

export function applyDocumentLang(locale: AppLocale): void {
  document.documentElement.lang = locale === "zh-CN" ? "zh-CN" : "en";
}

export async function setAppLocale(locale: AppLocale): Promise<void> {
  persistLocale(locale);
  applyDocumentLang(locale);
  await i18n.changeLanguage(locale);
}

const initialLocale = resolveInitialLocale();
applyDocumentLang(initialLocale);

void i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": {
      common: commonZh,
      shell: shellZh,
      connection: connectionZh,
      terminal: terminalZh,
      preview: previewZh,
      tools: toolsZh,
      welcome: welcomeZh,
      commands: commandsZh,
      errors: errorsZh,
    },
    en: {
      common: commonEn,
      shell: shellEn,
      connection: connectionEn,
      terminal: terminalEn,
      preview: previewEn,
      tools: toolsEn,
      welcome: welcomeEn,
      commands: commandsEn,
      errors: errorsEn,
    },
  },
  lng: initialLocale,
  fallbackLng: "en",
  defaultNS: "common",
  ns: [...NAMESPACES],
  interpolation: { escapeValue: false },
  // Locale JSON uses flat keys like "cmd.proc-pgrep.title".
  keySeparator: false,
  nsSeparator: ":",
  returnNull: false,
});

export default i18n;
