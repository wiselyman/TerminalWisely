import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { isSyntheticTerminalMouseEvent } from "../lib/terminalSelectionDrag";
import { isExtractableArchivePath } from "../lib/archivePath";

interface TerminalLinkContextMenuProps {
  x: number;
  y: number;
  pathKind: "file" | "directory";
  path: string;
  onClose: () => void;
  onCopyName: () => void;
  onCopyPath: () => void;
  onDownload?: () => void;
  onSendToRemote?: () => void;
  onPreview: () => void;
  onViewSize: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove: () => void;
  onCompress: () => void;
  onExtract?: () => void;
}

const MENU_WIDTH = 220;
const MENU_MARGIN = 8;

function clampMenuLeft(left: number) {
  return Math.min(Math.max(MENU_MARGIN, left), window.innerWidth - MENU_WIDTH - MENU_MARGIN);
}

function computeMenuPosition(x: number, y: number, menuHeight: number) {
  const left = clampMenuLeft(x);
  let top = y + 6;
  if (top + menuHeight > window.innerHeight - MENU_MARGIN) {
    top = Math.max(MENU_MARGIN, y - menuHeight - 6);
  }
  return { top, left };
}

export function TerminalLinkContextMenu({
  x,
  y,
  pathKind,
  path,
  onClose,
  onCopyName,
  onCopyPath,
  onDownload,
  onSendToRemote,
  onPreview,
  onViewSize,
  onRename,
  onDelete,
  onMove,
  onCompress,
  onExtract,
}: TerminalLinkContextMenuProps) {
  const { t } = useTranslation("terminal");
  const menuRef = useRef<HTMLDivElement>(null);
  const openedAtRef = useRef(0);
  const [position, setPosition] = useState(() =>
    computeMenuPosition(x, y, 320),
  );
  const showExtract =
    pathKind === "file" &&
    !!onExtract &&
    isExtractableArchivePath(path);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const next = computeMenuPosition(x, y, el.offsetHeight);
    setPosition((prev) =>
      prev.top === next.top && prev.left === next.left ? prev : next,
    );
  }, [x, y]);

  useEffect(() => {
    openedAtRef.current = performance.now();

    const isNearOpenPoint = (event: MouseEvent) =>
      Math.hypot(event.clientX - x, event.clientY - y) <= 8;

    const onDismiss = (event: MouseEvent) => {
      if (isSyntheticTerminalMouseEvent(event)) return;
      if (event.button !== 0) return;
      const elapsed = performance.now() - openedAtRef.current;
      if (elapsed < 900 && isNearOpenPoint(event)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    let disposed = false;
    const timer = window.setTimeout(() => {
      if (disposed) return;
      document.addEventListener("mousedown", onDismiss, true);
      document.addEventListener("click", onDismiss, true);
      document.addEventListener("keydown", onKeyDown);
    }, 0);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDismiss, true);
      document.removeEventListener("click", onDismiss, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, x, y]);

  return createPortal(
    <div
      ref={menuRef}
      className="terminal-fs-context-menu tab-context-menu"
      role="menu"
      aria-label={t("fsMenuAria")}
      style={{
        top: position.top,
        left: position.left,
        width: MENU_WIDTH,
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="tab-context-menu-item"
        role="menuitem"
        onClick={() => {
          onCopyName();
          onClose();
        }}
      >
        {t("copyName")}
      </button>
      <button
        type="button"
        className="tab-context-menu-item"
        role="menuitem"
        onClick={() => {
          onCopyPath();
          onClose();
        }}
      >
        {t("copyPath")}
      </button>
      <div className="tab-context-menu-separator" role="separator" />
      {onDownload ? (
        <button
          type="button"
          className="tab-context-menu-item"
          role="menuitem"
          onClick={() => {
            onDownload();
            onClose();
          }}
        >
          {pathKind === "directory" ? t("downloadFolder") : t("downloadFile")}
        </button>
      ) : null}
      {onSendToRemote ? (
        <button
          type="button"
          className="tab-context-menu-item"
          role="menuitem"
          onClick={() => {
            onSendToRemote();
            onClose();
          }}
        >
          {t("sendToRemote")}
        </button>
      ) : null}
      {onDownload || onSendToRemote ? (
        <div className="tab-context-menu-separator" role="separator" />
      ) : null}
      {pathKind === "file" ? (
        <button
          type="button"
          className="tab-context-menu-item"
          role="menuitem"
          onClick={() => {
            onPreview();
            onClose();
          }}
        >
          {t("editAndPreview")}
        </button>
      ) : null}
      <button
        type="button"
        className="tab-context-menu-item"
        role="menuitem"
        onClick={() => {
          onCompress();
          onClose();
        }}
      >
        {t("compress")}
      </button>
      {showExtract ? (
        <button
          type="button"
          className="tab-context-menu-item"
          role="menuitem"
          onClick={() => {
            onExtract();
            onClose();
          }}
        >
          {t("extract")}
        </button>
      ) : null}
      <button
        type="button"
        className="tab-context-menu-item"
        role="menuitem"
        onClick={() => {
          onRename();
          onClose();
        }}
      >
        {t("rename")}
      </button>
      <button
        type="button"
        className="tab-context-menu-item"
        role="menuitem"
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        {t("delete")}
      </button>
      <button
        type="button"
        className="tab-context-menu-item"
        role="menuitem"
        onClick={() => {
          onMove();
          onClose();
        }}
      >
        {t("moveToDir")}
      </button>
      <div className="tab-context-menu-separator" role="separator" />
      <button
        type="button"
        className="tab-context-menu-item"
        role="menuitem"
        onClick={() => {
          onViewSize();
          onClose();
        }}
      >
        {t("viewSize")}
      </button>
    </div>,
    document.body,
  );
}

interface TerminalBlankContextMenuProps {
  x: number;
  y: number;
  showUpload: boolean;
  canCopy: boolean;
  onClose: () => void;
  onCopy?: () => void;
  onUpload?: () => void;
  onPaste: () => void;
}

export function TerminalBlankContextMenu({
  x,
  y,
  showUpload,
  canCopy,
  onClose,
  onCopy,
  onUpload,
  onPaste,
}: TerminalBlankContextMenuProps) {
  const { t } = useTranslation("terminal");
  const menuRef = useRef<HTMLDivElement>(null);
  const openedAtRef = useRef(0);
  const [position, setPosition] = useState(() =>
    computeMenuPosition(x, y, 120),
  );

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const next = computeMenuPosition(x, y, el.offsetHeight);
    setPosition((prev) =>
      prev.top === next.top && prev.left === next.left ? prev : next,
    );
  }, [x, y]);

  useEffect(() => {
    openedAtRef.current = performance.now();

    const isNearOpenPoint = (event: MouseEvent) =>
      Math.hypot(event.clientX - x, event.clientY - y) <= 8;

    const onDismiss = (event: MouseEvent) => {
      if (isSyntheticTerminalMouseEvent(event)) return;
      if (event.button !== 0) return;
      const elapsed = performance.now() - openedAtRef.current;
      if (elapsed < 900 && isNearOpenPoint(event)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    let disposed = false;
    const timer = window.setTimeout(() => {
      if (disposed) return;
      document.addEventListener("mousedown", onDismiss, true);
      document.addEventListener("click", onDismiss, true);
      document.addEventListener("keydown", onKeyDown);
    }, 0);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDismiss, true);
      document.removeEventListener("click", onDismiss, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, x, y]);

  return createPortal(
    <div
      ref={menuRef}
      className="terminal-fs-context-menu tab-context-menu"
      role="menu"
      aria-label={t("blankMenuAria")}
      style={{
        top: position.top,
        left: position.left,
        width: MENU_WIDTH,
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="tab-context-menu-item"
        role="menuitem"
        disabled={!canCopy}
        onClick={() => {
          onCopy?.();
          onClose();
        }}
      >
        {t("copy")}
      </button>
      {showUpload && onUpload ? (
        <button
          type="button"
          className="tab-context-menu-item"
          role="menuitem"
          onClick={() => {
            onUpload();
            onClose();
          }}
        >
          {t("upload")}
        </button>
      ) : null}
      <button
        type="button"
        className="tab-context-menu-item"
        role="menuitem"
        onClick={() => {
          onPaste();
          onClose();
        }}
      >
        {t("paste")}
      </button>
    </div>,
    document.body,
  );
}
