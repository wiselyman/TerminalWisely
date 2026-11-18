import { create } from "zustand";
import { desktopTargetKey, type DesktopTarget } from "../lib/desktopTarget";
import { rememberEditorWiselyPath } from "../lib/editorWiselyRecents";
import { decodeEditorText, editorLanguageForPath, encodeEditorText, type TextFormat } from "../lib/editorWiselyText";
import { readLocalBytes, writeLocalBytes, saveLocalBytesAs as saveLocalBytesAsApi } from "../lib/localFsApi";
import { readPreviewRemoteBytes, writePreviewRemoteBytes } from "../lib/previewRemoteBytes";

export type EditorDocument = { id: string; path: string; text: string; savedText: string; format: TextFormat; language: string; error: string | null; saving: boolean; loading: boolean };
type State = { docs: Record<string, EditorDocument[]>; active: Record<string, string | null>; open: (target: DesktopTarget, path: string) => Promise<void>; edit: (target: DesktopTarget, id: string, text: string) => void; save: (target: DesktopTarget, id?: string) => Promise<void>; saveAsLocal: (id: string, path: string) => Promise<void>; activate: (target: DesktopTarget, id: string) => void; close: (target: DesktopTarget, id: string) => void };
const idFor = (path: string) => path;

export const useEditorWiselyStore = create<State>((set, get) => ({
  docs: {}, active: {},
  open: async (target, path) => {
    rememberEditorWiselyPath(target, path);
    const key = desktopTargetKey(target);
    const existing = (get().docs[key] ?? []).find((d) => d.path === path);
    if (existing) { set((s) => ({ active: { ...s.active, [key]: existing.id } })); return; }
    set((s) => ({ docs: { ...s.docs, [key]: [...(s.docs[key] ?? []), { id: idFor(path), path, text: "", savedText: "", format: { bom: false, newline: "\n" }, language: editorLanguageForPath(path), error: null, saving: false, loading: true }] }, active: { ...s.active, [key]: idFor(path) } }));
    try {
      const result = target.kind === "local" ? { bytes: await readLocalBytes(path), mime: "text/plain" } : await readPreviewRemoteBytes(target.sessionId, path);
      const decoded = decodeEditorText(result.bytes);
      set((s) => ({ docs: { ...s.docs, [key]: (s.docs[key] ?? []).map((d) => d.id === path && d.loading ? { ...d, text: decoded.text, savedText: decoded.text, format: decoded.format, loading: false } : d) } }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = ["binary_file", "file_too_large", "unsupported_encoding"].find((item) => message.includes(item));
      set((s) => ({ docs: { ...s.docs, [key]: (s.docs[key] ?? []).map((d) => d.id === path ? { ...d, error: code ?? message, loading: false } : d) } }));
    }
  },
  edit: (target, id, text) => { const key = desktopTargetKey(target); set((s) => ({ docs: { ...s.docs, [key]: (s.docs[key] ?? []).map((d) => d.id === id ? { ...d, text, error: null, loading: false } : d) } })); },
  save: async (target, id) => {
    const key = desktopTargetKey(target); const doc = (get().docs[key] ?? []).find((d) => d.id === (id ?? get().active[key])); if (!doc) return;
    set((s) => ({ docs: { ...s.docs, [key]: (s.docs[key] ?? []).map((d) => d.id === doc.id ? { ...d, saving: true, error: null } : d) } }));
    try { const bytes = encodeEditorText(doc.text, doc.format); if (target.kind === "local") await writeLocalBytes(doc.path, bytes); else await writePreviewRemoteBytes(target.sessionId, doc.path, bytes);
      set((s) => ({ docs: { ...s.docs, [key]: (s.docs[key] ?? []).map((d) => d.id === doc.id ? { ...d, savedText: doc.text, saving: false } : d) } }));
    } catch (error) { set((s) => ({ docs: { ...s.docs, [key]: (s.docs[key] ?? []).map((d) => d.id === doc.id ? { ...d, saving: false, error: error instanceof Error ? error.message : String(error) } : d) } })); }
  },
  saveAsLocal: async (id, path) => {
    const key = "local";
    const doc = (get().docs[key] ?? []).find((item) => item.id === id);
    if (!doc || !path.trim()) return;
    set((s) => ({ docs: { ...s.docs, [key]: (s.docs[key] ?? []).map((item) => item.id === id ? { ...item, saving: true, error: null } : item) } }));
    try {
      await saveLocalBytesAsApi(path, encodeEditorText(doc.text, doc.format));
      set((s) => ({ docs: { ...s.docs, [key]: (s.docs[key] ?? []).map((item) => item.id === id ? { ...item, id: path, path, savedText: doc.text, saving: false } : item) }, active: { ...s.active, [key]: s.active[key] === id ? path : s.active[key] } }));
    } catch (error) {
      set((s) => ({ docs: { ...s.docs, [key]: (s.docs[key] ?? []).map((item) => item.id === id ? { ...item, saving: false, error: error instanceof Error ? error.message : String(error) } : item) } }));
    }
  },
  activate: (target, id) => { const key = desktopTargetKey(target); set((s) => ({ active: { ...s.active, [key]: id } })); },
  close: (target, id) => { const key = desktopTargetKey(target); set((s) => { const docs = (s.docs[key] ?? []).filter((d) => d.id !== id); return { docs: { ...s.docs, [key]: docs }, active: { ...s.active, [key]: docs.length ? docs[docs.length - 1].id : null } }; }); },
}));
