import type { ReactNode } from "react";

type Props = {
  emptyText?: string | null;
  loadingText?: string | null;
  leading?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Shared sidebar entity list chrome for Hosts and Kubernetes. */
export function EntityCatalog({
  emptyText,
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
        <p className="empty-state">{emptyText}</p>
      ) : null}
      {children}
    </section>
  );
}
