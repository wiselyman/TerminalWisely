import { useEffect } from "react";
import { createPortal } from "react-dom";

export type ColumnHeaderMenuAction = "asc" | "desc" | "clear" | "filter";

export type ColumnHeaderMenuTarget = {
  column: string;
  x: number;
  y: number;
};

export function ColumnHeaderMenu({
  target,
  labels,
  onAction,
  onClose,
}: {
  target: ColumnHeaderMenuTarget;
  labels: Record<ColumnHeaderMenuAction, string>;
  onAction: (action: ColumnHeaderMenuAction, column: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        onClose();
      }
    };
    const onPointer = (event: MouseEvent) => {
      const node = event.target as HTMLElement | null;
      if (node?.closest?.("[data-testid='db-column-menu']")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onPointer, true);
    };
  }, [onClose]);

  const items: ColumnHeaderMenuAction[] = ["asc", "desc", "clear", "filter"];

  return createPortal(
    <div
      className="tab-context-menu db-column-menu"
      data-testid="db-column-menu"
      style={{ left: target.x, top: target.y }}
      role="menu"
    >
      {items.map((action) => (
        <button
          key={action}
          type="button"
          className="tab-context-menu-item"
          role="menuitem"
          data-testid={`db-column-menu-${action}`}
          onClick={() => onAction(action, target.column)}
        >
          <span className="tab-context-menu-label">{labels[action]}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
