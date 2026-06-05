import { useEffect, useRef, useState } from "react";

interface SidebarAddMenuProps {
  onLocal: () => void;
  onRemote: () => void;
  align?: "left" | "right";
}

export function SidebarAddMenu({
  onLocal,
  onRemote,
  align = "left",
}: SidebarAddMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`sidebar-add-menu${align === "right" ? " sidebar-add-menu-right" : ""}`}
    >
      <button
        type="button"
        className="sidebar-add-btn"
        aria-label="新建连接"
        title="新建连接"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        +
      </button>
      {open ? (
        <div className="sidebar-add-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className="sidebar-add-option local"
            onClick={() => {
              setOpen(false);
              onLocal();
            }}
          >
            Local 本地终端
          </button>
          <button
            type="button"
            role="menuitem"
            className="sidebar-add-option remote"
            onClick={() => {
              setOpen(false);
              onRemote();
            }}
          >
            Remote 远程 SSH
          </button>
        </div>
      ) : null}
    </div>
  );
}
