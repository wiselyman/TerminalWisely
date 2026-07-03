import type { PreviewOpenResult } from "../types";

export interface PreviewTab {
  id: string;
  sessionId: string;
  path: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  data: PreviewOpenResult | null;
  editedContent: string | null;
  searchQuery: string;
  activeMatchIndex: number;
  searchCaseSensitive: boolean;
  searchRegex: boolean;
  searchWholeWord: boolean;
  markdownMode: "source" | "preview";
}

export function previewTabId(sessionId: string, path: string) {
  return `${sessionId}::${path}`;
}

export function createPreviewTab(sessionId: string, path: string): PreviewTab {
  return {
    id: previewTabId(sessionId, path),
    sessionId,
    path,
    loading: true,
    saving: false,
    error: null,
    data: null,
    editedContent: null,
    searchQuery: "",
    activeMatchIndex: 0,
    searchCaseSensitive: false,
    searchRegex: false,
    searchWholeWord: false,
    markdownMode: "source",
  };
}

export function isPreviewTabDirty(tab: PreviewTab) {
  if (!tab.data?.editable) return false;
  const saved = tab.data.text_content ?? "";
  return tab.editedContent !== null && tab.editedContent !== saved;
}

export function previewTabLabel(tab: PreviewTab) {
  return tab.data?.filename ?? tab.path.split(/[/\\]/).pop() ?? tab.path;
}

export function previewTabsForSession(tabs: PreviewTab[], sessionId: string) {
  return tabs.filter((tab) => tab.sessionId === sessionId);
}
