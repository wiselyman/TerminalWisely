import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface WorkspaceToolRailProps {
  children: ReactNode;
}

export function WorkspaceToolRail({ children }: WorkspaceToolRailProps) {
  const { t } = useTranslation("shell");
  return (
    <aside className="workspace-tool-rail" aria-label={t("toolRailAria")}>
      <div className="workspace-tool-rail-tools">{children}</div>
    </aside>
  );
}

interface WorkspaceToolButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function WorkspaceToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: WorkspaceToolButtonProps) {
  const { t } = useTranslation("shell");
  return (
    <button
      type="button"
      className={`workspace-tool-btn${active ? " active" : ""}`}
      title={disabled ? t("toolNeedTab") : label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
