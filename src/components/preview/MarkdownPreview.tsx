import type { SearchOptions } from "../../lib/previewSearch";
import {
  markdownModeFromViewMode,
  type PreviewViewMode,
} from "../../lib/previewMarkdownMode";
import { EditableTextPreview } from "./EditableTextPreview";
import { MarkdownWysiwygEditor } from "./MarkdownWysiwygEditor";

interface MarkdownPreviewProps {
  text: string;
  extension: string;
  mode: PreviewViewMode;
  query: string;
  activeMatchIndex: number;
  searchOptions?: SearchOptions;
  editable?: boolean;
  tabId?: string;
  sessionId?: string;
  filePath?: string;
  onChange?: (value: string) => void;
}

export function MarkdownPreview({
  text,
  extension,
  mode,
  query,
  activeMatchIndex,
  searchOptions,
  editable = false,
  tabId,
  sessionId,
  filePath,
  onChange,
}: MarkdownPreviewProps) {
  const mdMode = markdownModeFromViewMode(mode);

  if (mdMode === "source") {
    return (
      <EditableTextPreview
        tabId={tabId}
        text={text}
        extension={extension}
        query={query}
        activeMatchIndex={activeMatchIndex}
        searchOptions={searchOptions}
        editable={editable}
        onChange={onChange}
      />
    );
  }

  if (!tabId || !sessionId || !filePath) {
    return (
      <div className="preview-markdown-wysiwyg-error" role="alert">
        Missing preview context
      </div>
    );
  }

  return (
    <MarkdownWysiwygEditor
      tabId={tabId}
      sessionId={sessionId}
      filePath={filePath}
      text={text}
      editable={editable}
      onChange={onChange}
    />
  );
}
