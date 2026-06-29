import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { isSyntheticTerminalMouseEvent } from "../lib/terminalSelectionDrag";

interface TabContextMenuProps {
  x: number;
  y: number;
  tabIndex: number;
  tabCount: number;
  onClose: () => void;
  onCloseTab: () => void;
  onCloseOthers: () => void;
  onCloseLeft: () => void;
  onCloseRight: () => void;
}

const MENU_WIDTH = 200;

function clampMenuLeft(left: number) {
  return Math.min(Math.max(8, left), window.innerWidth - MENU_WIDTH - 8);
}

export function TabContextMenu({
  x,
  y,
  tabIndex,
  tabCount,
  onClose,
  onCloseTab,
  onCloseOthers,
  onCloseLeft,
  onCloseRight,
}: TabContextMenuProps) {
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

  const hasLeft = tabIndex > 0;
  const hasRight = tabIndex >= 0 && tabIndex < tabCount - 1;
  const hasOthers = tabCount > 1;

  return createPortal(
    <div
      ref={menuRef}
      className="tab-shortcut-menu tab-context-menu"
      role="menu"
      aria-label="页签操作"
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
          onCloseTab();
          onClose();
        }}
      >
        关闭
      </button>
      <button
        type="button"
        className="tab-context-menu-item"
        role="menuitem"
        disabled={!hasOthers}
        onClick={() => {
          onCloseOthers();
          onClose();
        }}
      >
        关闭其他
      </button>
      <button
        type="button"
        className="tab-context-menu-item"
        role="menuitem"
        disabled={!hasLeft}
        onClick={() => {
          onCloseLeft();
          onClose();
        }}
      >
        关闭左侧
      </button>
      <button
        type="button"
        className="tab-context-menu-item"
        role="menuitem"
        disabled={!hasRight}
        onClick={() => {
          onCloseRight();
          onClose();
        }}
      >
        关闭右侧
      </button>
    </div>,
    document.body,
  );
}
