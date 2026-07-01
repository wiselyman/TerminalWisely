import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { isSyntheticTerminalMouseEvent } from "../lib/terminalSelectionDrag";

interface TerminalLinkContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopyName: () => void;
  onCopyPath: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove: () => void;
}

const MENU_WIDTH = 220;

function clampMenuLeft(left: number) {
  return Math.min(Math.max(8, left), window.innerWidth - MENU_WIDTH - 8);
}

export function TerminalLinkContextMenu({
  x,
  y,
  onClose,
  onCopyName,
  onCopyPath,
  onRename,
  onDelete,
  onMove,
}: TerminalLinkContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const openedAtRef = useRef(0);

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
      aria-label="文件操作"
      style={{
        top: y + 6,
        left: clampMenuLeft(x),
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
        复制文件名称
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
        复制文件路径
      </button>
      <div className="tab-context-menu-separator" role="separator" />
      <button
        type="button"
        className="tab-context-menu-item"
        role="menuitem"
        onClick={() => {
          onRename();
          onClose();
        }}
      >
        重命名
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
        删除
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
        移动到目录
      </button>
    </div>,
    document.body,
  );
}
