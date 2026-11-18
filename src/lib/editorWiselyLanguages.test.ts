// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { defaultHighlightStyle, ensureSyntaxTree } from "@codemirror/language";
import { highlightTree } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import { editorLanguageExtension } from "./editorWiselyLanguages";

const samples: Record<string, string> = {
  c: "int main() { return 0; }",
  shell: "#!/bin/sh\necho \"$HOME\"",
  toml: "name = \"EditorWisely\"\nport = 8080",
  kotlin: "fun main() { println(\"ok\") }",
  swift: "let value = \"ok\"",
  ruby: "def greet; puts \"ok\"; end",
  properties: "app.name=EditorWisely\napp.enabled=true",
  dockerfile: "FROM node:22\nCOPY . /app",
  makefile: "all:\n\t@echo ok",
  javascript: "const value = 1;",
  go: "package main\nfunc main() {}",
};

describe("EditorWisely syntax highlighting coverage", () => {
  it.each(Object.entries(samples))("parses and highlights %s", (language, doc) => {
    const extension = editorLanguageExtension(language);
    expect(extension, `${language} must have a registered parser`).not.toBeNull();
    const state = EditorState.create({ doc, extensions: [extension!] });
    const tree = ensureSyntaxTree(state, doc.length, 100);
    expect(tree, `${language} must finish parsing the sample`).not.toBeNull();
    const highlighted: string[] = [];
    highlightTree(tree!, defaultHighlightStyle, (_from, _to, classes) => highlighted.push(classes));
    expect(highlighted.some(Boolean), `${language} must produce styled tokens`).toBe(true);
  });

  it("keeps plain text and unknown extensions without a syntax parser", () => {
    expect(editorLanguageExtension("text")).toBeNull();
    expect(editorLanguageExtension("unknown")).toBeNull();
  });
});
