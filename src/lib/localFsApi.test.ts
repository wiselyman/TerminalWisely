import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

describe("local desktop filesystem API", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("uses local commands and never includes an SSH session id", async () => {
    const api = await import("./localFsApi");
    invoke.mockResolvedValueOnce(["/", "/Users/test"])
      .mockResolvedValueOnce({ path: "/Users/test", entries: [] })
      .mockResolvedValueOnce("/Users/test/notes.md")
      .mockResolvedValueOnce("body")
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await api.listLocalRoots();
    await api.listLocalDirectory("/Users/test");
    await api.createLocalPath("/Users/test", "notes.md", "file");
    await api.readLocalText("/Users/test/notes.md");
    await api.writeLocalText("/Users/test/notes.md", "body");
    await api.writeLocalBytes("/Users/test/export.docx", new Uint8Array([1, 2, 255]));
    await api.renameLocalPath("/Users/test/notes.md", "renamed.md");
    await api.moveLocalPath("/Users/test/renamed.md", "/Users/test/archive");
    await api.deleteLocalPath("/Users/test/archive/renamed.md");
    await api.getLocalPathSize("/Users/test");
    await api.openLocalPath("/Users/test");
    await api.revealLocalPath("/Users/test");

    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      "list_local_roots",
      "list_local_directory",
      "create_local_path",
      "read_local_text",
      "write_local_text",
      "write_local_bytes",
      "rename_local_path",
      "move_local_path",
      "delete_local_path",
      "get_local_path_size",
      "open_local_path",
      "reveal_local_path",
    ]);
    for (const [, payload] of invoke.mock.calls) {
      expect(payload === undefined ? "" : JSON.stringify(payload)).not.toContain("session_id");
    }
    expect(invoke.mock.calls[5][1]).toEqual({ request: { path: "/Users/test/export.docx", base64: "AQL/" } });
  });

  it("keeps POSIX, drive-root, and UNC parent paths intact", async () => {
    const { parentLocalPath } = await import("./localFsApi");
    expect(parentLocalPath("/Users/wangyunfei/Documents")).toBe("/Users/wangyunfei");
    expect(parentLocalPath("C:\\Users\\Yunfei")).toBe("C:\\Users");
    expect(parentLocalPath("C:\\")).toBe("C:\\");
    expect(parentLocalPath("\\\\server\\share\\folder")).toBe("\\\\server\\share");
  });
});
