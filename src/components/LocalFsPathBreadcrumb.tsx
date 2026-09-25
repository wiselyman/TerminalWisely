import { pathBreadcrumbSegments } from "../lib/localFsOps";
import { LocalFsChevronRightIcon } from "./LocalFsIcons";

type Props = {
  path: string;
  disabled?: boolean;
  onNavigate: (path: string) => void;
  onEdit: () => void;
};

/** Clickable `/`-separated path segments; click empty area to type a path. */
export function LocalFsPathBreadcrumb({
  path,
  disabled = false,
  onNavigate,
  onEdit,
}: Props) {
  const segments = pathBreadcrumbSegments(path);

  return (
    <div
      className="local-fs-path-breadcrumb"
      data-testid="local-fs-path-breadcrumb"
      role="navigation"
      aria-label="Path"
      onClick={(event) => {
        if (disabled) return;
        if (event.target === event.currentTarget) onEdit();
      }}
    >
      {segments.length === 0 ? (
        <button
          type="button"
          className="local-fs-crumb is-placeholder"
          disabled={disabled}
          onClick={onEdit}
        >
          /
        </button>
      ) : (
        segments.map((seg, index) => {
          const isLast = index === segments.length - 1;
          return (
            <span key={seg.path} className="local-fs-crumb-wrap">
              {index > 0 ? <LocalFsChevronRightIcon /> : null}
              <button
                type="button"
                className={`local-fs-crumb${isLast ? " is-current" : ""}`}
                data-testid={`local-fs-crumb-${seg.path === "/" ? "root" : seg.label}`}
                disabled={disabled}
                title={seg.path}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isLast) {
                    onEdit();
                    return;
                  }
                  onNavigate(seg.path);
                }}
              >
                {seg.label}
              </button>
            </span>
          );
        })
      )}
    </div>
  );
}
