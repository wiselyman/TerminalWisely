import { beforeEach, describe, expect, it, vi } from "vitest";

const readLocalBytes = vi.fn();
const writeLocalBytes = vi.fn();
const saveLocalBytesAs = vi.fn();
const readPreviewRemoteBytes = vi.fn();
const writePreviewRemoteBytes = vi.fn();
vi.mock("../lib/localFsApi", () => ({ readLocalBytes, writeLocalBytes, saveLocalBytesAs }));
vi.mock("../lib/previewRemoteBytes", () => ({ readPreviewRemoteBytes, writePreviewRemoteBytes }));

describe("EditorWisely document store", () => {
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    readLocalBytes.mockResolvedValue(new TextEncoder().encode("local\r\n"));
    saveLocalBytesAs.mockResolvedValue(undefined);
    readPreviewRemoteBytes.mockResolvedValue({ bytes: new TextEncoder().encode("remote"), mime: "text/plain" });
  });
  it("isolates documents by local and SSH session and preserves line ending on save", async () => {
    const { useEditorWiselyStore: store } = await import("./editorWiselyStore");
    await store.getState().open({ kind: "local" }, "/tmp/a.txt");
    await store.getState().open({ kind: "ssh", sessionId: "s1" }, "/tmp/a.txt");
    expect(readPreviewRemoteBytes).toHaveBeenCalledWith("s1", "/tmp/a.txt");
    expect(Object.keys(store.getState().docs)).toHaveLength(2);
    const localKey = Object.keys(store.getState().docs).find((key) => key !== "ssh:s1")!;
    const local = store.getState().docs[localKey][0];
    expect(local.text).toBe("local\n");
    store.getState().edit({ kind: "local" }, local.id, "changed\n");
    await store.getState().save({ kind: "local" }, local.id);
    expect(writeLocalBytes).toHaveBeenCalledWith("/tmp/a.txt", new TextEncoder().encode("changed\r\n"));
  });
  it("retains edited text and dirty state after a failed remote save", async () => {
    const { useEditorWiselyStore: store } = await import("./editorWiselyStore");
    const target = { kind: "ssh" as const, sessionId: "ssh:session-a" };
    await store.getState().open(target, "/etc/example.conf");
    const doc = store.getState().docs["ssh:ssh:session-a"][0];
    store.getState().edit(target, doc.id, "unsaved");
    writePreviewRemoteBytes.mockRejectedValueOnce(new Error("disconnected"));
    await store.getState().save(target, doc.id);
    const after = store.getState().docs["ssh:ssh:session-a"][0];
    expect(after).toMatchObject({ text: "unsaved", savedText: "remote", error: "disconnected", saving: false });
  });
  it("tracks a pending local read and loads the exact file text when it finishes", async () => {
    const { useEditorWiselyStore: store } = await import("./editorWiselyStore");
    let resolveRead!: (bytes: Uint8Array) => void;
    readLocalBytes.mockReturnValueOnce(new Promise<Uint8Array>((resolve) => { resolveRead = resolve; }));
    const opening = store.getState().open({ kind: "local" }, "/tmp/loaded.txt");
    expect(store.getState().docs.local[0].loading).toBe(true);
    resolveRead(new TextEncoder().encode("content from disk"));
    await opening;
    expect(store.getState().docs.local[0]).toMatchObject({ text: "content from disk", savedText: "content from disk", loading: false });
  });
  it("does not replace user edits when a pending local read finishes late", async () => {
    const { useEditorWiselyStore: store } = await import("./editorWiselyStore");
    let resolveRead!: (bytes: Uint8Array) => void;
    readLocalBytes.mockReturnValueOnce(new Promise<Uint8Array>((resolve) => { resolveRead = resolve; }));
    const target = { kind: "local" as const };
    const opening = store.getState().open(target, "/tmp/slow.txt");
    store.getState().edit(target, "/tmp/slow.txt", "user edit");
    resolveRead(new TextEncoder().encode("late disk text"));
    await opening;
    expect(store.getState().docs.local[0]).toMatchObject({ text: "user edit", savedText: "", loading: false });
  });
  it("moves a local document to a Save As path only after the write succeeds", async () => {
    const { useEditorWiselyStore: store } = await import("./editorWiselyStore");
    await store.getState().open({ kind: "local" }, "/tmp/source.txt");
    const doc = store.getState().docs.local[0];
    store.getState().edit({ kind: "local" }, doc.id, "new contents\n");
    await store.getState().saveAsLocal(doc.id, "/tmp/copy.txt");
    expect(saveLocalBytesAs).toHaveBeenLastCalledWith("/tmp/copy.txt", new TextEncoder().encode("new contents\r\n"));
    expect(store.getState().docs.local[0]).toMatchObject({ id: "/tmp/copy.txt", path: "/tmp/copy.txt", savedText: "new contents\n", text: "new contents\n" });
  });
});
