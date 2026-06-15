interface SidebarAddMenuProps {
  onRemote: () => void;
  align?: "left" | "right";
}

/** Opens the remote SSH connection form (+). Local terminal is pinned in bookmarks. */
export function SidebarAddMenu({
  onRemote,
  align = "left",
}: SidebarAddMenuProps) {
  return (
    <div
      className={`sidebar-add-menu${align === "right" ? " sidebar-add-menu-right" : ""}`}
    >
      <button
        type="button"
        className="sidebar-add-btn"
        aria-label="新建 SSH 连接"
        title="Remote 远程 SSH"
        onClick={onRemote}
      >
        +
      </button>
    </div>
  );
}
