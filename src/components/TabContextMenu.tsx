import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

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

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

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
