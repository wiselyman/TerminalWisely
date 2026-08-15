import { useTranslation } from "react-i18next";

interface SidebarAddMenuProps {
  onRemote: () => void;
  align?: "left" | "right";
}

/** Opens the remote SSH connection form (+). */
export function SidebarAddMenu({
  onRemote,
  align = "left",
}: SidebarAddMenuProps) {
  const { t } = useTranslation("shell");
  return (
    <div
      className={`sidebar-add-menu${align === "right" ? " sidebar-add-menu-right" : ""}`}
    >
      <button
        type="button"
        className="sidebar-add-btn"
        aria-label={t("newSsh")}
        title={t("remoteSshTitle")}
        onClick={onRemote}
      >
        +
      </button>
    </div>
  );
}
