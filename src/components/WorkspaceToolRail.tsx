import type { ReactNode } from "react";

interface WorkspaceToolRailProps {
  children: ReactNode;
}

export function WorkspaceToolRail({ children }: WorkspaceToolRailProps) {
  return (
    <aside className="workspace-tool-rail" aria-label="工作区工具">
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
  return (
    <button
      type="button"
      className={`workspace-tool-btn${active ? " active" : ""}`}
      title={disabled ? "请先打开一个终端页签" : label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
