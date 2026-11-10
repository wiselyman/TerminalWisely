import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

export type MarkWiselyFormatCommand =
  | "bold" | "italic" | "strikeThrough" | "inlineCode"
  | "h1" | "h2" | "h3" | "paragraph" | "quote" | "codeBlock"
  | "h4" | "h5" | "h6" | "bulletList" | "orderedList" | "taskList"
  | "indent" | "outdent" | "link" | "table" | "horizontalRule"
  | "undo" | "redo" | "insertImage";

interface MarkWiselyFormatContextMenuProps {
  x: number;
  y: number;
  disabledCommands?: string[];
  onCommand: (command: MarkWiselyFormatCommand) => void;
  onDismiss: () => void;
}

const groups: Array<Array<{ command: MarkWiselyFormatCommand; label: string }>> = [
  [
    { command: "bold", label: "formatBold" },
    { command: "italic", label: "formatItalic" },
    { command: "strikeThrough", label: "formatStrike" },
    { command: "inlineCode", label: "formatInlineCode" },
  ],
  [
    { command: "h1", label: "formatHeading1" },
    { command: "h2", label: "formatHeading2" },
    { command: "h3", label: "formatHeading3" },
    { command: "h4", label: "formatHeading4" },
    { command: "h5", label: "formatHeading5" },
    { command: "h6", label: "formatHeading6" },
    { command: "paragraph", label: "formatParagraph" },
  ],
  [
    { command: "quote", label: "formatQuote" },
    { command: "codeBlock", label: "formatCodeBlock" },
    { command: "bulletList", label: "formatBulletedList" },
    { command: "orderedList", label: "formatNumberedList" },
    { command: "taskList", label: "formatTaskList" },
    { command: "indent", label: "formatIndent" },
    { command: "outdent", label: "formatOutdent" },
  ],
  [
    { command: "link", label: "formatLink" },
    { command: "table", label: "formatTable" },
    { command: "horizontalRule", label: "formatHorizontalRule" },
    { command: "insertImage", label: "formatInsertImage" },
    { command: "undo", label: "formatUndo" },
    { command: "redo", label: "formatRedo" },
  ],
];

export function MarkWiselyFormatContextMenu({ x, y, disabledCommands = [], onCommand, onDismiss }: MarkWiselyFormatContextMenuProps) {
  const { t } = useTranslation("preview");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    menuRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onDismiss]);

  return (
    <div
      ref={menuRef}
      className="markwisely-format-context-menu"
      role="menu"
      aria-label={t("formatContextMenu")}
      data-testid="markwisely-format-context-menu"
      tabIndex={-1}
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {groups.map((group, index) => (
        <div className="markwisely-format-context-menu-group" key={index}>
          {group.map(({ command, label }) => (
            <button
              key={command}
              type="button"
              role="menuitem"
              data-format-command={command}
              disabled={disabledCommands.includes(command)}
              onClick={() => onCommand(command)}
            >
              {t(label)}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
