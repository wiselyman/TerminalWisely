import { describe, expect, it, vi } from "vitest";
import { fuzzyMatchesMarkdownPath, listMarkdownEntries, searchMarkdownWorkspace, type MarkdownWorkspaceProvider } from "./markWiselyWorkspace";
import type { LocalFsEntry } from "../types";

const dir = (name: string, path: string): LocalFsEntry => ({ name, path, kind: "directory" });
const file = (name: string, path: string): LocalFsEntry => ({ name, path, kind: "file" });

function provider(tree: Record<string, LocalFsEntry[]>, contents: Record<string, string>): MarkdownWorkspaceProvider {
  return {
    listDirectory: async (path) => ({ path, entries: tree[path] ?? [] }),
    readMarkdown: async (path) => {
      if (!(path in contents)) throw new Error("Permission denied");
      return contents[path];
    },
  };
}

describe("MarkWisely workspace", () => {
  it("supports subsequence quick-open matching on filenames and paths", () => {
    expect(fuzzyMatchesMarkdownPath("mws", "/notes/my-workspace.md")).toBe(true);
    expect(fuzzyMatchesMarkdownPath("mxs", "/notes/my-workspace.md")).toBe(false);
  });

  it("lists visible Markdown files and folders in stable directory-first order", async () => {
    const result = await listMarkdownEntries(provider({
      "/notes": [file("z.md", "/notes/z.md"), dir("b", "/notes/b"), file(".secret.md", "/notes/.secret.md"), file("readme.txt", "/notes/readme.txt"), file("a.markdown", "/notes/a.markdown"), dir(".hidden", "/notes/.hidden"), file("outside.md", "/elsewhere/outside.md")],
    }, {}), "/notes");
    expect(result.entries.map((entry) => entry.name)).toEqual(["b", "a.markdown", "z.md"]);
  });

  it("searches explicit content, reports progress, skips hidden paths, and tolerates unreadable files", async () => {
    const progress = vi.fn();
    const result = await searchMarkdownWorkspace(provider({
      "/notes": [dir("sub", "/notes/sub"), dir(".private", "/notes/.private"), file("one.md", "/notes/one.md")],
      "/notes/sub": [file("two.markdown", "/notes/sub/two.markdown"), file("locked.md", "/notes/sub/locked.md")],
    }, {
      "/notes/one.md": "No match here",
      "/notes/sub/two.markdown": "A searchable phrase appears here",
    }), "/notes", "searchable phrase", new AbortController().signal, progress);
    expect(result.results.map((item) => item.path)).toEqual(["/notes/sub/two.markdown"]);
    expect(result.skippedFiles).toBe(1);
    expect(progress).toHaveBeenCalled();
  });

  it("stops between directory reads when cancelled and never crosses its root", async () => {
    const controller = new AbortController();
    const readMarkdown = vi.fn(async () => "needle");
    const listDirectory = vi.fn(async (path: string) => {
      controller.abort();
      return { path, entries: [file("outside.md", "/outside/outside.md")] };
    });
    const searchProvider = { listDirectory, readMarkdown };
    await expect(searchMarkdownWorkspace(searchProvider, "/root", "needle", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(readMarkdown).not.toHaveBeenCalled();
    expect(listDirectory).toHaveBeenCalledTimes(1);
  });

  it("does not read Markdown files outside the selected root", async () => {
    const readMarkdown = vi.fn(async () => "needle");
    const listDirectory = vi.fn(async (path: string) => ({ path, entries: [file("outside.md", "/outside/outside.md")] }));
    const result = await searchMarkdownWorkspace({ listDirectory, readMarkdown }, "/root", "needle", new AbortController().signal);
    expect(result.results).toEqual([]);
    expect(readMarkdown).not.toHaveBeenCalled();
  });

  it("does not report the same path twice when a directory provider repeats entries", async () => {
    const readMarkdown = vi.fn(async () => "needle");
    const listDirectory = vi.fn(async (path: string) => ({ path, entries: [file("same.md", "/root/same.md")] }));
    const result = await searchMarkdownWorkspace({ listDirectory, readMarkdown }, "/root", "needle", new AbortController().signal);
    expect(result.results.map((item) => item.path)).toEqual(["/root/same.md"]);
    expect(readMarkdown).toHaveBeenCalledTimes(1);
  });

  it("scans and returns large result sets without truncating matches", async () => {
    const entries = Array.from({ length: 500 }, (_, index) => file(`note-${index}.md`, `/root/note-${index}.md`));
    const readMarkdown = vi.fn(async () => "large-set-marker");
    const result = await searchMarkdownWorkspace({
      listDirectory: async (path) => ({ path, entries }),
      readMarkdown,
    }, "/root", "large-set-marker", new AbortController().signal);

    expect(result.filesScanned).toBe(500);
    expect(result.results).toHaveLength(500);
    expect(readMarkdown).toHaveBeenCalledTimes(500);
  });
});
