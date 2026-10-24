import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewOpenResult } from "../types";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

function opened(path: string, handleId = "preview-handle"): PreviewOpenResult {
  return {
    handle_id: handleId,
    kind: "markdown",
    session_id: "session-a",
    resolved_path: path,
    filename: path.split("/").pop() ?? "note.md",
    extension: "md",
    total_size: 16,
    truncated: false,
    editable: true,
    text_content: "# Note\n",
    local_cache_path: null,
    uses_sudo: false,
  };
}

describe("markWiselyStore", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    invoke.mockReset();
    invoke.mockImplementation(async (command: string, args: { request?: Record<string, unknown> }) => {
      if (command === "preview_open") {
        return opened(String(args.request?.path ?? "/home/e2e/note.md"));
      }
      if (command === "preview_save") return opened("/home/e2e/note.md");
      return null;
    });
  });

  it("keeps recent Markdown paths isolated by host", async () => {
    const { useMarkWiselyStore } = await import("./markWiselyStore");
    await useMarkWiselyStore.getState().openDocument({
      sessionId: "session-a",
      hostKey: "server-a",
      path: "/home/e2e/a.md",
    });
    await useMarkWiselyStore.getState().openDocument({
      sessionId: "session-b",
      hostKey: "server-b",
      path: "/home/e2e/b.md",
    });

    expect(useMarkWiselyStore.getState().getRecentFiles("server-a")).toEqual([
      expect.objectContaining({ path: "/home/e2e/a.md" }),
    ]);
    expect(useMarkWiselyStore.getState().getRecentFiles("server-b")).toEqual([
      expect.objectContaining({ path: "/home/e2e/b.md" }),
    ]);
  });

  it("saves the latest editor value to the remote preview handle", async () => {
    const { useMarkWiselyStore } = await import("./markWiselyStore");
    await useMarkWiselyStore.getState().openDocument({
      sessionId: "session-a",
      hostKey: "server-a",
      path: "/home/e2e/note.md",
    });
    useMarkWiselyStore.getState().setEditorValue("session-a", "# Updated\n");

    await useMarkWiselyStore.getState().saveDocument("session-a");

    expect(invoke).toHaveBeenCalledWith("preview_save", {
      request: {
        handle_id: "preview-handle",
        content: "# Updated\n",
        sudo_password: null,
      },
    });
    expect(useMarkWiselyStore.getState().getDocument("session-a")).toMatchObject({
      text: "# Updated\n",
      savedText: "# Updated\n",
      saving: false,
      error: null,
    });
  });

  it("creates a remote file before opening it in the editor", async () => {
    const { useMarkWiselyStore } = await import("./markWiselyStore");
    await useMarkWiselyStore.getState().createDocument({
      sessionId: "session-a",
      hostKey: "server-a",
      parentDir: "/home/e2e/docs",
      name: "draft.md",
      path: "/home/e2e/docs/draft.md",
    });

    expect(invoke).toHaveBeenNthCalledWith(1, "create_path", {
      request: {
        session_id: "session-a",
        parent_dir: "/home/e2e/docs",
        name: "draft.md",
        kind: "file",
        sudo_password: null,
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "preview_open", {
      request: {
        session_id: "session-a",
        path: "/home/e2e/docs/draft.md",
        sudo_password: null,
      },
    });
    expect(useMarkWiselyStore.getState().getDocument("session-a")?.path).toBe(
      "/home/e2e/docs/draft.md",
    );
  });

  it("preserves unsaved editor text when remote save fails", async () => {
    const { useMarkWiselyStore } = await import("./markWiselyStore");
    await useMarkWiselyStore.getState().openDocument({
      sessionId: "session-a",
      hostKey: "server-a",
      path: "/home/e2e/note.md",
    });
    useMarkWiselyStore.getState().setEditorValue("session-a", "# Keep me\n");
    invoke.mockRejectedValueOnce(new Error("remote write failed"));

    await expect(
      useMarkWiselyStore.getState().saveDocument("session-a"),
    ).rejects.toThrow("remote write failed");
    expect(useMarkWiselyStore.getState().getDocument("session-a")).toMatchObject({
      text: "# Keep me\n",
      savedText: "# Note\n",
      saving: false,
      error: "remote write failed",
    });
  });
});
