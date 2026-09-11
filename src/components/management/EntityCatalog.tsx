import type { ReactNode } from "react";

type Props = {
  emptyText?: string | null;
  emptyAction?: ReactNode;
  loadingText?: string | null;
  leading?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Shared sidebar entity list chrome for Hosts and Kubernetes. */
export function EntityCatalog({
  emptyText,
  emptyAction,
  loadingText,
  leading,
  children,
  className,
}: Props) {
  return (
    <section className={`saved-list entity-catalog${className ? ` ${className}` : ""}`}>
      {leading}
      {loadingText ? <p className="empty-state">{loadingText}</p> : null}
      {!loadingText && emptyText ? (
        <div className="empty-state entity-catalog-empty">
          <p>{emptyText}</p>
          {emptyAction}
        </div>
      ) : null}
      {children}
    </section>
  );
}
