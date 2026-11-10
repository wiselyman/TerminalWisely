import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { extractMarkdownHeadings, filterMarkdownHeadings } from "../../lib/markWiselyOutline";
import "./MarkWiselyOutlinePanel.css";

type Props = {
  documentText: string;
  onNavigateToHeading: (index: number) => void;
};

const VDITOR_HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

function activeVditorContent(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(".markwisely-editor .vditor-ir .vditor-reset[contenteditable='true']"))
    .find((element) => element.getClientRects().length > 0) ?? null;
}

export function MarkWiselyOutlinePanel({ documentText, onNavigateToHeading }: Props) {
  const { t } = useTranslation("tools");
  const [outlineFilter, setOutlineFilter] = useState("");
  const [activeHeadingIndex, setActiveHeadingIndex] = useState(-1);
  const headings = extractMarkdownHeadings(documentText);
  const filteredHeadings = filterMarkdownHeadings(headings, outlineFilter);

  useEffect(() => {
    const syncCurrentHeading = () => {
      const content = activeVditorContent();
      const elements = Array.from(content?.querySelectorAll<HTMLElement>(VDITOR_HEADING_SELECTOR) ?? []);
      const bounds = content?.getBoundingClientRect();
      let current = -1;
      elements.forEach((element, index) => {
        const headingBounds = element.getBoundingClientRect();
        if (!bounds || (headingBounds.top < bounds.bottom - 12 && headingBounds.bottom > bounds.top + 12)) current = index;
      });
      if (current < 0 && elements.length && bounds) {
        const passed = elements.findIndex((element) => element.getBoundingClientRect().top >= bounds.top);
        current = passed < 0 ? elements.length - 1 : Math.max(0, passed - 1);
      }
      setActiveHeadingIndex(elements.length ? current : -1);
    };
    document.addEventListener("scroll", syncCurrentHeading, true);
    const editor = activeVditorContent();
    editor?.addEventListener("scroll", syncCurrentHeading);
    const observer = editor ? new MutationObserver(syncCurrentHeading) : null;
    observer?.observe(editor!, { childList: true, subtree: true, characterData: true });
    requestAnimationFrame(syncCurrentHeading);
    return () => {
      document.removeEventListener("scroll", syncCurrentHeading, true);
      editor?.removeEventListener("scroll", syncCurrentHeading);
      observer?.disconnect();
    };
  }, [documentText]);

  return (
    <aside className="markwisely-outline-panel" aria-label={t("markwisely.outlineTitle")} data-testid="markwisely-outline-panel">
      <div className="markwisely-outline-panel-head">{t("markwisely.outlineTitle")}</div>
      <input
        aria-label={t("markwisely.outlineFilter")}
        placeholder={t("markwisely.outlineFilter")}
        value={outlineFilter}
        onChange={(event) => setOutlineFilter(event.target.value)}
        data-testid="markwisely-outline-filter"
      />
      <div className="markwisely-outline-panel-list">
        {filteredHeadings.map((heading) => (
          <button
            type="button"
            key={heading.index}
            className={`markwisely-outline-heading${heading.index === activeHeadingIndex ? " is-current" : ""}`}
            style={{ paddingLeft: `${10 + (heading.level - 1) * 11}px` }}
            aria-current={heading.index === activeHeadingIndex ? "location" : undefined}
            title={heading.text}
            onClick={() => {
              setActiveHeadingIndex(heading.index);
              onNavigateToHeading(heading.index);
            }}
            data-testid="markwisely-outline-heading"
          >
            <span>{heading.text}</span>
          </button>
        ))}
        {filteredHeadings.length === 0 ? <div className="markwisely-outline-panel-empty">{t("markwisely.outlineEmpty")}</div> : null}
      </div>
    </aside>
  );
}
