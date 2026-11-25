import { describe, expect, it, vi } from "vitest";
import { openLocalFileInDesktop } from "./localFileOpen";

describe("openLocalFileInDesktop", () => {
  it("opens a Markdown path in maximized MarkWisely after activating Home", async () => {
    const calls: string[] = [];
    const actions = {
      activateLocalDesktop: () => calls.push("activate-local"),
      showMarkWisely: () => calls.push("maximize-markwisely"),
      openMarkdown: async (path: string) => { calls.push(`markdown:${path}`); },
      showEditorWisely: () => calls.push("maximize-editorwisely"),
      openText: async (path: string) => { calls.push(`text:${path}`); },
    };

    await openLocalFileInDesktop("/tmp/Design.MD", actions);

    expect(calls).toEqual([
      "activate-local",
      "maximize-markwisely",
      "markdown:/tmp/Design.MD",
    ]);
  });

  it("opens any other path in maximized EditorWisely after activating Home", async () => {
    const calls: string[] = [];
    const actions = {
      activateLocalDesktop: () => calls.push("activate-local"),
      showMarkWisely: () => calls.push("maximize-markwisely"),
      openMarkdown: async (path: string) => { calls.push(`markdown:${path}`); },
      showEditorWisely: () => calls.push("maximize-editorwisely"),
      openText: async (path: string) => { calls.push(`text:${path}`); },
    };

    await openLocalFileInDesktop("/tmp/settings.conf", actions);

    expect(calls).toEqual([
      "activate-local",
      "maximize-editorwisely",
      "text:/tmp/settings.conf",
    ]);
  });
});
