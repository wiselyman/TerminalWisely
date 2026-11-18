import type { Extension } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { simpleMode } from "@codemirror/legacy-modes/mode/simple-mode";
import { c, kotlin } from "@codemirror/legacy-modes/mode/clike";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { yaml } from "@codemirror/lang-yaml";
import { xml } from "@codemirror/lang-xml";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { go } from "@codemirror/lang-go";
import { php } from "@codemirror/lang-php";
import { sass } from "@codemirror/lang-sass";

const makefile = StreamLanguage.define(simpleMode({
  start: [
    { regex: /#.*/, token: "comment" },
    { regex: /^[A-Za-z0-9_./%-]+(?=\s*::?)/, token: "def" },
    { regex: /\$\([^)]+\)|\$\{[^}]+\}/, token: "variableName" },
    { regex: /\b(?:include|sinclude|-include|export|override|define|endef|vpath)\b/, token: "keyword" },
    { regex: /[:=+?]+/, token: "operator" },
    { regex: /\\./, token: "escape" },
  ],
}));

const languageExtensions: Record<string, () => Extension> = {
  javascript: () => javascript().extension,
  jsx: () => javascript({ jsx: true }).extension,
  typescript: () => javascript({ typescript: true }).extension,
  tsx: () => javascript({ typescript: true, jsx: true }).extension,
  python: () => python().extension,
  json: () => json().extension,
  markdown: () => markdown().extension,
  html: () => html().extension,
  css: () => css().extension,
  yaml: () => yaml().extension,
  xml: () => xml().extension,
  rust: () => rust().extension,
  sql: () => sql().extension,
  cpp: () => cpp().extension,
  java: () => java().extension,
  go: () => go().extension,
  php: () => php().extension,
  sass: () => sass().extension,
  c: () => StreamLanguage.define(c),
  shell: () => StreamLanguage.define(shell),
  toml: () => StreamLanguage.define(toml),
  kotlin: () => StreamLanguage.define(kotlin),
  swift: () => StreamLanguage.define(swift),
  ruby: () => StreamLanguage.define(ruby),
  properties: () => StreamLanguage.define(properties),
  dockerfile: () => StreamLanguage.define(dockerFile),
  makefile: () => makefile,
};

export function editorLanguageExtension(language: string): Extension | null {
  return languageExtensions[language]?.() ?? null;
}
