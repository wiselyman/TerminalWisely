import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import {
  Archive,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  FolderArchive,
  FolderInput,
  HardDrive,
  MessageSquare,
  Pencil,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import {
  armTerminalPointerSuppress,
  isSyntheticTerminalMouseEvent,
  releaseStaleXtermDocumentMouseListeners,
} from "../lib/terminalSelectionDrag";
import { isExtractableArchivePath } from "../lib/archivePath";
import { ContextMenuItem } from "./ContextMenuItem";

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
  onSendToChat?: () => void;
}

const MENU_WIDTH = 236;
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
  onSendToChat,
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

    const swallowPointer = (event: MouseEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onDismiss = (event: MouseEvent) => {
      if (isSyntheticTerminalMouseEvent(event)) return;
      if (event.button !== 0) return;
      const elapsed = performance.now() - openedAtRef.current;
      // Trackpad right-click often emits a companion left click at the same point.
      if (elapsed < 250 && isNearOpenPoint(event)) {
        swallowPointer(event);
        armTerminalPointerSuppress(400);
        return;
      }
      if (menuRef.current?.contains(event.target as Node)) return;
      // Closing click must not start an xterm selection drag underneath.
      swallowPointer(event);
      armTerminalPointerSuppress(400);
      releaseStaleXtermDocumentMouseListeners({ armClickSuppress: false });
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
      <ContextMenuItem
        icon={Copy}
        onClick={() => {
          onCopyName();
          onClose();
        }}
      >
        {t("copyName")}
      </ContextMenuItem>
      <ContextMenuItem
        icon={ClipboardCopy}
        onClick={() => {
          onCopyPath();
          onClose();
        }}
      >
        {t("copyPath")}
      </ContextMenuItem>
      {pathKind === "file" && onSendToChat ? (
        <ContextMenuItem
          icon={MessageSquare}
          onClick={() => {
            onSendToChat();
            onClose();
          }}
        >
          {t("sendToChat")}
        </ContextMenuItem>
      ) : null}
      <div className="tab-context-menu-separator" role="separator" />
      {onDownload ? (
        <ContextMenuItem
          icon={Download}
          onClick={() => {
            onDownload();
            onClose();
          }}
        >
          {pathKind === "directory" ? t("downloadFolder") : t("downloadFile")}
        </ContextMenuItem>
      ) : null}
      {onSendToRemote ? (
        <ContextMenuItem
          icon={Send}
          onClick={() => {
            onSendToRemote();
            onClose();
          }}
        >
          {t("sendToRemote")}
        </ContextMenuItem>
      ) : null}
      {onDownload || onSendToRemote ? (
        <div className="tab-context-menu-separator" role="separator" />
      ) : null}
      {pathKind === "file" ? (
        <ContextMenuItem
          icon={Eye}
          onClick={() => {
            onPreview();
            onClose();
          }}
        >
          {t("editAndPreview")}
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem
        icon={Archive}
        onClick={() => {
          onCompress();
          onClose();
        }}
      >
        {t("compress")}
      </ContextMenuItem>
      {showExtract ? (
        <ContextMenuItem
          icon={FolderArchive}
          onClick={() => {
            onExtract();
            onClose();
          }}
        >
          {t("extract")}
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem
        icon={Pencil}
        onClick={() => {
          onRename();
          onClose();
        }}
      >
        {t("rename")}
      </ContextMenuItem>
      <ContextMenuItem
        icon={Trash2}
        danger
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        {t("delete")}
      </ContextMenuItem>
      <ContextMenuItem
        icon={FolderInput}
        onClick={() => {
          onMove();
          onClose();
        }}
      >
        {t("moveToDir")}
      </ContextMenuItem>
      <div className="tab-context-menu-separator" role="separator" />
      <ContextMenuItem
        icon={HardDrive}
        onClick={() => {
          onViewSize();
          onClose();
        }}
      >
        {t("viewSize")}
      </ContextMenuItem>
    </div>,
    document.body,
  );
}

interface TerminalBlankContextMenuProps {
  x: number;
  y: number;
  showUpload: boolean;
  canCopy: boolean;
  canSendToChat?: boolean;
  onClose: () => void;
  onCopy?: () => void;
  onSendToChat?: () => void;
  onUpload?: () => void;
  onPaste: () => void;
}

export function TerminalBlankContextMenu({
  x,
  y,
  showUpload,
  canCopy,
  canSendToChat,
  onClose,
  onCopy,
  onSendToChat,
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

    const swallowPointer = (event: MouseEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onDismiss = (event: MouseEvent) => {
      if (isSyntheticTerminalMouseEvent(event)) return;
      if (event.button !== 0) return;
      const elapsed = performance.now() - openedAtRef.current;
      if (elapsed < 250 && isNearOpenPoint(event)) {
        swallowPointer(event);
        armTerminalPointerSuppress(400);
        return;
      }
      if (menuRef.current?.contains(event.target as Node)) return;
      swallowPointer(event);
      armTerminalPointerSuppress(400);
      releaseStaleXtermDocumentMouseListeners({ armClickSuppress: false });
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
      <ContextMenuItem
        icon={Copy}
        disabled={!canCopy}
        onClick={() => {
          onCopy?.();
          onClose();
        }}
      >
        {t("copy")}
      </ContextMenuItem>
      {onSendToChat ? (
        <ContextMenuItem
          icon={MessageSquare}
          disabled={!canSendToChat}
          onClick={() => {
            onSendToChat();
            onClose();
          }}
        >
          {t("sendToChatSelection")}
        </ContextMenuItem>
      ) : null}
      {showUpload && onUpload ? (
        <ContextMenuItem
          icon={Upload}
          onClick={() => {
            onUpload();
            onClose();
          }}
        >
          {t("upload")}
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem
        icon={ClipboardPaste}
        onClick={() => {
          onPaste();
          onClose();
        }}
      >
        {t("paste")}
      </ContextMenuItem>
    </div>,
    document.body,
  );
}
