import { useEffect } from "react";
import { createPortal } from "react-dom";
import { type ObjectMenuAction } from "./workbenchModel";

export type { ObjectMenuAction };
export type ObjectMenuTarget = {
  database: string;
  schema: string;
  name: string;
  kind: string;
  x: number;
  y: number;
};

const LABEL_KEYS: Record<ObjectMenuAction, string> = {
  open: "dbMenuOpen",
  definition: "dbMenuDefinition",
  rename: "dbMenuRename",
  empty: "dbMenuEmpty",
  truncate: "dbMenuTruncate",
  drop: "dbMenuDrop",
  refresh: "dbMenuRefresh",
  "maintain-analyze": "dbMenuAnalyze",
  "maintain-vacuum": "dbMenuVacuum",
  "maintain-reindex": "dbMenuReindex",
  "maintain-optimize": "dbMenuOptimize",
};

export function ObjectContextMenu({
  target,
  actions,
  labels,
  onAction,
  onClose,
}: {
  target: ObjectMenuTarget;
  actions: ObjectMenuAction[];
  labels: Record<string, string>;
  onAction: (action: ObjectMenuAction) => void;
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
      if (node?.closest?.("[data-testid='db-object-menu']")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onPointer, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="tab-context-menu db-object-menu"
      data-testid="db-object-menu"
      style={{ left: target.x, top: target.y }}
      role="menu"
    >
      {actions.map((action) => {
        const labelKey = LABEL_KEYS[action];
        return (
          <button
            key={action}
            type="button"
            className="tab-context-menu-item"
            role="menuitem"
            data-testid={`db-object-menu-${action}`}
            onClick={() => onAction(action)}
          >
            <span className="tab-context-menu-label">{labels[labelKey] ?? action}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
