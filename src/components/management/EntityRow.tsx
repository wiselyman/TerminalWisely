import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

type Props = {
  selected?: boolean;
  title?: string;
  icon: ReactNode;
  primary: string;
  secondary?: string;
  onActivate: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  actions?: ReactNode;
  /** When true, row fills remaining width beside external drag handle. */
  embedded?: boolean;
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
  embedded = false,
}: Props) {
  return (
    <div
      className={`saved-item saved-item-compact entity-row${selected ? " selected" : ""}${embedded ? " entity-row--embedded" : ""}`}
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
