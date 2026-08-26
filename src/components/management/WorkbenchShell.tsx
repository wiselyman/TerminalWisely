import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

type Props = {
  title?: ReactNode;
  subtitle?: ReactNode;
  headerActions?: ReactNode;
  leftNav?: ReactNode;
  main: ReactNode;
  detail?: ReactNode;
  /** Vertical drag split between main (top) and detail (bottom). */
  detailResizable?: boolean;
  /** Initial detail pane height as % of the split stack (20–80). */
  detailPercent?: number;
  onDetailPercentChange?: (percent: number) => void;
  dock?: ReactNode;
  statusBar?: ReactNode;
  className?: string;
};

const STORAGE_DETAIL = "tw.k8s.detailPercent";

function loadDetailPercent(fallback: number): number {
  try {
    const raw = localStorage.getItem(STORAGE_DETAIL);
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(80, Math.max(20, n));
  } catch {
    return fallback;
  }
}

/**
 * Shared management workbench frame:
 * header + optional left nav + main + detail + bottom dock.
 */
export function WorkbenchShell({
  title,
  subtitle,
  headerActions,
  leftNav,
  main,
  detail,
  detailResizable = false,
  detailPercent: detailPercentProp,
  onDetailPercentChange,
  dock,
  statusBar,
  className,
}: Props) {
  const [detailPercent, setDetailPercent] = useState(() =>
    loadDetailPercent(detailPercentProp ?? 42),
  );
  const splitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (detailPercentProp == null) return;
    setDetailPercent(Math.min(80, Math.max(20, detailPercentProp)));
  }, [detailPercentProp]);

  const commitPercent = useCallback(
    (next: number) => {
      const clamped = Math.min(80, Math.max(20, next));
      setDetailPercent(clamped);
      try {
        localStorage.setItem(STORAGE_DETAIL, String(clamped));
      } catch {
        /* ignore */
      }
      onDetailPercentChange?.(clamped);
    },
    [onDetailPercentChange],
  );

  const startDetailResize = (event: ReactMouseEvent) => {
    if (!detailResizable || !detail) return;
    event.preventDefault();
    const el = splitRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    document.body.classList.add("k8s-detail-resizing");

    const onMove = (moveEvent: MouseEvent) => {
      const y = moveEvent.clientY - rect.top;
      const pct = ((rect.height - y) / rect.height) * 100;
      commitPercent(pct);
    };
    const onUp = () => {
      document.body.classList.remove("k8s-detail-resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const mainBlock = <section className="mgmt-workbench-main">{main}</section>;
  const detailBlock = detail ? (
    <aside className="mgmt-workbench-detail">{detail}</aside>
  ) : null;

  return (
    <div className={`mgmt-workbench${className ? ` ${className}` : ""}`}>
      {title != null || subtitle != null || headerActions ? (
        <header className="mgmt-workbench-header">
          <div className="mgmt-workbench-title">
            {title != null ? <h2>{title}</h2> : null}
            {subtitle ? (
              <span className="mgmt-workbench-subtitle">{subtitle}</span>
            ) : null}
          </div>
          {headerActions ? (
            <div className="mgmt-workbench-header-actions">{headerActions}</div>
          ) : null}
        </header>
      ) : null}
      {statusBar}
      <div className="mgmt-workbench-body">
        {leftNav ? <nav className="mgmt-workbench-nav">{leftNav}</nav> : null}
        {detail && detailResizable ? (
          <div
            ref={splitRef}
            className="mgmt-workbench-split"
            style={
              {
                "--mgmt-detail-pct": `${detailPercent}%`,
              } as Record<string, string>
            }
          >
            {mainBlock}
            <div
              className="mgmt-workbench-h-resizer"
              role="separator"
              aria-orientation="horizontal"
              aria-valuenow={Math.round(detailPercent)}
              aria-valuemin={20}
              aria-valuemax={80}
              onMouseDown={startDetailResize}
            />
            {detailBlock}
          </div>
        ) : (
          <>
            {mainBlock}
            {detailBlock}
          </>
        )}
      </div>
      {dock}
    </div>
  );
}
