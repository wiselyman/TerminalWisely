import { X } from "lucide-react";
import type { MarkWiselyDocument } from "../../stores/markWiselyStore";

interface Props {
  documents: MarkWiselyDocument[];
  activeDocumentId: string | null;
  tabsLabel: string;
  unsavedLabel: string;
  closeLabel: string;
  onActivate: (documentId: string) => void;
  onClose: (documentId: string) => void;
}

export function MarkWiselyDocumentTabs({
  documents,
  activeDocumentId,
  tabsLabel,
  unsavedLabel,
  closeLabel,
  onActivate,
  onClose,
}: Props) {
  if (documents.length < 2) return null;
  return (
    <div className="markwisely-document-tabs" role="tablist" aria-label={tabsLabel} data-testid="markwisely-document-tabs">
      {documents.map((document) => {
        const active = document.documentId === activeDocumentId;
        const dirty = document.text !== document.savedText;
        const title = document.path.split(/[\\/]/).pop() || document.path;
        return (
          <div className={`markwisely-document-tab${active ? " is-active" : ""}`} key={document.documentId}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              title={document.path}
              data-testid="markwisely-document-tab"
              onClick={() => onActivate(document.documentId)}
            >
              <span>{title}</span>
              {dirty ? <span className="markwisely-document-tab-dirty" aria-label={unsavedLabel}>●</span> : null}
            </button>
            <button
              type="button"
              className="markwisely-document-tab-close"
              aria-label={`${closeLabel} ${title}`}
              title={closeLabel}
              onClick={() => onClose(document.documentId)}
            >
              <X aria-hidden="true" size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
