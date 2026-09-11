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
  FilePlus,
  FolderArchive,
  FolderInput,
  FolderPlus,
  HardDrive,
  MessageSquare,
  Pencil,
  RefreshCw,
  Scissors,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import type { LocalFsEntry } from "../types";
import { isExtractableArchivePath } from "../lib/archivePath";
import { ContextMenuItem } from "./ContextMenuItem";

const MENU_WIDTH = 236;
const MENU_MARGIN = 8;

function clampMenuLeft(left: number) {
  return Math.min(
    Math.max(MENU_MARGIN, left),
    window.innerWidth - MENU_WIDTH - MENU_MARGIN,
  );
}

function computeMenuPosition(x: number, y: number, menuHeight: number) {
  const left = clampMenuLeft(x);
  let top = y + 6;
  if (top + menuHeight > window.innerHeight - MENU_MARGIN) {
    top = Math.max(MENU_MARGIN, y - menuHeight - 6);
  }
  return { top, left };
}

type EntryMenuProps = {
  kind: "entry";
  x: number;
  y: number;
  entry: LocalFsEntry;
  canPaste: boolean;
  onClose: () => void;
  onCopyName: () => void;
  onCopyPath: () => void;
  onCopyItems: () => void;
  onCutItems: () => void;
  onPasteItems?: () => void;
  onDuplicate: () => void;
  onDownload: () => void;
  onUpload?: () => void;
  onSendToRemote: () => void;
  onPreview?: () => void;
  onCompress: () => void;
  onExtract?: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove: () => void;
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onViewSize?: () => void;
  onSendToChat?: () => void;
};

type BackgroundMenuProps = {
  kind: "background";
  x: number;
  y: number;
  canPaste: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onUploadLocal: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onPasteItems?: () => void;
};

export type LocalFsContextMenuProps = EntryMenuProps | BackgroundMenuProps;

export function LocalFsContextMenu(props: LocalFsContextMenuProps) {
  const { t } = useTranslation(["tools", "terminal"]);
  const menuRef = useRef<HTMLDivElement>(null);
  const openedAtRef = useRef(0);
  const [position, setPosition] = useState(() =>
    computeMenuPosition(props.x, props.y, 320),
  );

  const pathKind =
    props.kind === "entry" && props.entry.kind === "directory"
      ? "directory"
      : "file";
  const showExtract =
    props.kind === "entry" &&
    pathKind === "file" &&
    !!props.onExtract &&
    isExtractableArchivePath(props.entry.path);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const next = computeMenuPosition(props.x, props.y, el.offsetHeight);
    setPosition((prev) =>
      prev.top === next.top && prev.left === next.left ? prev : next,
    );
  }, [props.x, props.y]);

  useEffect(() => {
    openedAtRef.current = performance.now();
    window.getSelection()?.removeAllRanges();

    const isNearOpenPoint = (event: MouseEvent) =>
      Math.hypot(event.clientX - props.x, event.clientY - props.y) <= 8;

    const swallowPointer = (event: MouseEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onDismiss = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const elapsed = performance.now() - openedAtRef.current;
      // Trackpad right-click often emits a companion left click at the same point.
      if (elapsed < 250 && isNearOpenPoint(event)) {
        swallowPointer(event);
        return;
      }
      if (menuRef.current?.contains(event.target as Node)) return;
      // Closing click must not start a text selection under the menu.
      swallowPointer(event);
      window.getSelection()?.removeAllRanges();
      props.onClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
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
  }, [props.onClose, props.x, props.y]);

  const run = (action: () => void) => {
    action();
    props.onClose();
  };

  const menu =
    props.kind === "background" ? (
      <>
        <ContextMenuItem
          icon={FolderPlus}
          onClick={() => run(props.onNewFolder)}
        >
          {t("terminal:newFolder")}
        </ContextMenuItem>
        <ContextMenuItem
          icon={FilePlus}
          onClick={() => run(props.onNewFile)}
        >
          {t("terminal:newFile")}
        </ContextMenuItem>
        {props.canPaste && props.onPasteItems ? (
          <ContextMenuItem
            icon={ClipboardPaste}
            onClick={() => run(props.onPasteItems!)}
          >
            {t("terminal:pasteItem")}
          </ContextMenuItem>
        ) : null}
        <div className="tab-context-menu-separator" role="separator" />
        <ContextMenuItem
          icon={Upload}
          onClick={() => run(props.onUploadLocal)}
        >
          {t("terminal:upload")}
        </ContextMenuItem>
        <ContextMenuItem
          icon={RefreshCw}
          onClick={() => run(props.onRefresh)}
        >
          {t("localFs.refresh")}
        </ContextMenuItem>
      </>
    ) : (
      <>
        <ContextMenuItem
          icon={Copy}
          onClick={() => run(props.onCopyName)}
        >
          {t("terminal:copyName")}
        </ContextMenuItem>
        <ContextMenuItem
          icon={ClipboardCopy}
          onClick={() => run(props.onCopyPath)}
        >
          {t("terminal:copyPath")}
        </ContextMenuItem>
        <ContextMenuItem
          icon={Copy}
          onClick={() => run(props.onCopyItems)}
        >
          {t("terminal:copyItem")}
        </ContextMenuItem>
        <ContextMenuItem
          icon={Scissors}
          onClick={() => run(props.onCutItems)}
        >
          {t("terminal:cutItem")}
        </ContextMenuItem>
        {props.canPaste && props.onPasteItems ? (
          <ContextMenuItem
            icon={ClipboardPaste}
            onClick={() => run(props.onPasteItems!)}
          >
            {t("terminal:pasteItem")}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          icon={Copy}
          onClick={() => run(props.onDuplicate)}
        >
          {t("terminal:duplicateItem")}
        </ContextMenuItem>
        {pathKind === "file" && props.onSendToChat ? (
          <ContextMenuItem
            icon={MessageSquare}
            onClick={() => run(props.onSendToChat!)}
          >
            {t("terminal:sendToChat")}
          </ContextMenuItem>
        ) : null}
        <div className="tab-context-menu-separator" role="separator" />
        {pathKind === "directory" && props.onNewFolder ? (
          <ContextMenuItem
            icon={FolderPlus}
            onClick={() => run(props.onNewFolder!)}
          >
            {t("terminal:newFolder")}
          </ContextMenuItem>
        ) : null}
        {pathKind === "directory" && props.onNewFile ? (
          <ContextMenuItem
            icon={FilePlus}
            onClick={() => run(props.onNewFile!)}
          >
            {t("terminal:newFile")}
          </ContextMenuItem>
        ) : null}
        {(pathKind === "directory" && (props.onNewFile || props.onNewFolder)) ? (
          <div className="tab-context-menu-separator" role="separator" />
        ) : null}
        <ContextMenuItem
          icon={Download}
          onClick={() => run(props.onDownload)}
        >
          {pathKind === "directory"
            ? t("terminal:downloadFolder")
            : t("terminal:downloadFile")}
        </ContextMenuItem>
        {pathKind === "directory" && props.onUpload ? (
          <ContextMenuItem
            icon={Upload}
            onClick={() => run(props.onUpload!)}
          >
            {t("terminal:upload")}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          icon={Send}
          onClick={() => run(props.onSendToRemote)}
        >
          {t("terminal:sendToRemote")}
        </ContextMenuItem>
        <div className="tab-context-menu-separator" role="separator" />
        {pathKind === "file" && props.onPreview ? (
          <ContextMenuItem
            icon={Eye}
            onClick={() => run(props.onPreview!)}
          >
            {t("terminal:editAndPreview")}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          icon={Archive}
          onClick={() => run(props.onCompress)}
        >
          {t("terminal:compress")}
        </ContextMenuItem>
        {showExtract ? (
          <ContextMenuItem
            icon={FolderArchive}
            onClick={() => run(props.onExtract!)}
          >
            {t("terminal:extract")}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          icon={Pencil}
          onClick={() => run(props.onRename)}
        >
          {t("terminal:rename")}
        </ContextMenuItem>
        <ContextMenuItem
          icon={Trash2}
          danger
          onClick={() => run(props.onDelete)}
        >
          {t("terminal:delete")}
        </ContextMenuItem>
        <ContextMenuItem
          icon={FolderInput}
          onClick={() => run(props.onMove)}
        >
          {t("terminal:moveToDir")}
        </ContextMenuItem>
        {pathKind === "directory" && props.onViewSize ? (
          <>
            <div className="tab-context-menu-separator" role="separator" />
            <ContextMenuItem
              icon={HardDrive}
              onClick={() => run(props.onViewSize!)}
            >
              {t("terminal:viewSize")}
            </ContextMenuItem>
          </>
        ) : null}
      </>
    );

  return createPortal(
    <div
      ref={menuRef}
      className="terminal-fs-context-menu tab-context-menu local-fs-context-menu"
      role="menu"
      aria-label={t("localFs.contextMenuAria")}
      style={{
        top: position.top,
        left: position.left,
        width: MENU_WIDTH,
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {menu}
    </div>,
    document.body,
  );
}
