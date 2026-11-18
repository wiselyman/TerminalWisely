// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { editorWiselyDirectoryForPath, readEditorWiselyRecents, rememberEditorWiselyPath } from "./editorWiselyRecents";

describe("EditorWisely recent files", () => {
  beforeEach(() => localStorage.clear());

  it("uses the parent folder of the latest file, including filesystem roots", () => {
    expect(editorWiselyDirectoryForPath("/Users/me/project/main.go")).toBe("/Users/me/project");
    expect(editorWiselyDirectoryForPath("/main.go")).toBe("/");
    expect(editorWiselyDirectoryForPath("C:\\work\\main.js")).toBe("C:\\work");
    expect(editorWiselyDirectoryForPath("C:\\main.js")).toBe("C:\\");
    expect(editorWiselyDirectoryForPath("notes.txt")).toBeUndefined();
  });

  it("remembers files per local and SSH workspace and returns newest first", () => {
    const local = { kind: "local" as const };
    const hostA = { kind: "ssh" as const, sessionId: "host-a" };
    const hostB = { kind: "ssh" as const, sessionId: "host-b" };
    rememberEditorWiselyPath(local, "/tmp/one.txt");
    rememberEditorWiselyPath(local, "/work/two.txt");
    rememberEditorWiselyPath(hostA, "/srv/a/config.yaml");
    rememberEditorWiselyPath(hostB, "/opt/b/main.go");

    expect(readEditorWiselyRecents(local)).toEqual(["/work/two.txt", "/tmp/one.txt"]);
    expect(readEditorWiselyRecents(hostA)).toEqual(["/srv/a/config.yaml"]);
    expect(readEditorWiselyRecents(hostB)).toEqual(["/opt/b/main.go"]);
  });
});
