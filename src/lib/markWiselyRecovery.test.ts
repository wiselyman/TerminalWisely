import { beforeEach, describe, expect, it } from "vitest";
import {
  readMarkWiselyDraft,
  removeMarkWiselyDraft,
  saveMarkWiselyDraft,
} from "./markWiselyRecovery";

describe("markWiselyRecovery", () => {
  beforeEach(() => localStorage.clear());

  it("keeps recovery drafts isolated by local/host scope and path", () => {
    saveMarkWiselyDraft(localStorage, "local", "/Users/a/note.md", "local draft", 1);
    saveMarkWiselyDraft(localStorage, "server-a", "/home/a/note.md", "host draft", 2);

    expect(readMarkWiselyDraft(localStorage, "local", "/Users/a/note.md")).toEqual({
      text: "local draft",
      updatedAt: 1,
    });
    expect(readMarkWiselyDraft(localStorage, "server-b", "/home/a/note.md")).toBeNull();
  });

  it("removes a draft without touching another document", () => {
    saveMarkWiselyDraft(localStorage, "server-a", "/home/a/one.md", "one", 1);
    saveMarkWiselyDraft(localStorage, "server-a", "/home/a/two.md", "two", 2);
    removeMarkWiselyDraft(localStorage, "server-a", "/home/a/one.md");

    expect(readMarkWiselyDraft(localStorage, "server-a", "/home/a/one.md")).toBeNull();
    expect(readMarkWiselyDraft(localStorage, "server-a", "/home/a/two.md")?.text).toBe("two");
  });

  it("ignores malformed stored drafts", () => {
    localStorage.setItem("terminal-wisely.markwisely-drafts.v1", "{");
    expect(readMarkWiselyDraft(localStorage, "local", "/note.md")).toBeNull();
  });
});
