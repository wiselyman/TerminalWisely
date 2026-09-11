import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  controls?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

/** Shared bottom dock (logs, preview utilities, etc.). */
export function BottomDock({
  title,
  controls,
  onClose,
  children,
  className,
}: Props) {
  return (
    <div className={`mgmt-bottom-dock${className ? ` ${className}` : ""}`}>
      <header>
        <strong>{title}</strong>
        <div className="mgmt-bottom-dock-controls">
          {controls}
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
      </header>
      <div className="mgmt-bottom-dock-body">{children}</div>
    </div>
  );
}
