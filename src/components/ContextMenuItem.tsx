/** Shared context-menu row: Lucide icon + label (not hand-drawn). */

import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = {
  icon: LucideIcon;
  children: ReactNode;
  danger?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type">;

export function ContextMenuItem({
  icon: Icon,
  children,
  danger,
  className,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      role="menuitem"
      className={[
        "tab-context-menu-item",
        danger ? "danger" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      <Icon className="tab-context-menu-icon" size={14} strokeWidth={1.5} aria-hidden />
      <span className="tab-context-menu-label">{children}</span>
    </button>
  );
}
