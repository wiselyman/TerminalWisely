import type { ReactNode } from "react";

type Props = {
  selected?: boolean;
  title?: string;
  icon: ReactNode;
  primary: string;
  secondary?: string;
  onActivate: () => void;
  actions?: ReactNode;
};

/** Shared compact sidebar row for servers and clusters. */
export function EntityRow({
  selected,
  title,
  icon,
  primary,
  secondary,
  onActivate,
  actions,
}: Props) {
  return (
    <div
      className={`saved-item saved-item-compact entity-row${selected ? " selected" : ""}`}
      title={title}
    >
      <button type="button" className="saved-item-main" onClick={onActivate}>
        {icon}
        <span className="saved-item-text saved-item-text-compact">
          <strong>{primary}</strong>
          {secondary ? (
            <>
              <span className="saved-item-sep" aria-hidden>
                {" "}
                ·{" "}
              </span>
              <span className="saved-item-host">{secondary}</span>
            </>
          ) : null}
        </span>
      </button>
      {actions ? <div className="saved-item-actions">{actions}</div> : null}
    </div>
  );
}
