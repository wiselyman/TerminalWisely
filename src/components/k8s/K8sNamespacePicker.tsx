import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import {
  filterNamespaceOptions,
  formatNamespaceTriggerLabel,
  selectAllNamespaces,
  selectionFromStore,
  toggleNamespaceInSelection,
  type NamespaceSelection,
} from "../../lib/k8s/namespacePicker";

interface K8sNamespacePickerProps {
  namespaces: string[];
  allNamespaces: boolean;
  selectedNamespaces: string[];
  namespace: string;
  allLabel: string;
  searchPlaceholder: string;
  "aria-label"?: string;
  onChange: (selection: NamespaceSelection) => void;
}

export function K8sNamespacePicker({
  namespaces,
  allNamespaces,
  selectedNamespaces,
  namespace,
  allLabel,
  searchPlaceholder,
  onChange,
  "aria-label": ariaLabel,
}: K8sNamespacePickerProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const selection = selectionFromStore(
    allNamespaces,
    selectedNamespaces,
    namespace,
  );
  const triggerLabel = formatNamespaceTriggerLabel(selection, allLabel);
  const filtered = filterNamespaceOptions(namespaces, query);
  const options =
    filtered.length > 0
      ? filtered
      : query.trim()
        ? [query.trim()]
        : namespaces;

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const menuMax = 280;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const openUp = spaceBelow < 160 && rect.top > spaceBelow;
    const maxHeight = Math.min(menuMax, openUp ? rect.top - 8 : spaceBelow);
    setMenuStyle({
      position: "fixed",
      left: rect.left,
      width: Math.max(rect.width, 200),
      maxHeight: Math.max(120, maxHeight),
      zIndex: 10050,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [open, options.length, triggerLabel]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      setQuery("");
    };
    const onScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const isNsChecked = (ns: string) =>
    selection.mode === "selected" && selection.namespaces.includes(ns);

  return (
    <div
      className={`k8s-ns-picker${open ? " open" : ""}`}
      ref={rootRef}
      data-testid="k8s-namespace-picker"
    >
      <button
        type="button"
        className="k8s-ns-picker-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((v) => {
            if (v) setQuery("");
            return !v;
          });
        }}
      >
        <span className="k8s-ns-picker-value">{triggerLabel}</span>
        <ChevronDown
          size={14}
          strokeWidth={2.25}
          className="k8s-ns-picker-chevron"
          aria-hidden
        />
      </button>
      {open
        ? createPortal(
            <div
              className="k8s-ns-picker-menu"
              ref={menuRef}
              style={menuStyle}
              data-testid="k8s-namespace-picker-menu"
            >
              <input
                ref={searchRef}
                type="search"
                className="k8s-ns-picker-search"
                value={query}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setOpen(false);
                    setQuery("");
                  }
                  if (e.key === "Enter") {
                    const next = query.trim();
                    if (next) {
                      onChange({ mode: "selected", namespaces: [next] });
                      setOpen(false);
                      setQuery("");
                    }
                  }
                }}
              />
              <ul id={listId} className="k8s-ns-picker-list" role="listbox">
                <li role="presentation">
                  <label className="k8s-ns-picker-option">
                    <input
                      type="checkbox"
                      checked={selection.mode === "all"}
                      onChange={() => onChange(selectAllNamespaces())}
                    />
                    <span className="k8s-ns-check-box" aria-hidden />
                    <span>{allLabel}</span>
                  </label>
                </li>
                {options.map((ns) => (
                  <li key={ns} role="presentation">
                    <label className="k8s-ns-picker-option">
                      <input
                        type="checkbox"
                        checked={isNsChecked(ns)}
                        onChange={() =>
                          onChange(toggleNamespaceInSelection(selection, ns))
                        }
                      />
                      <span className="k8s-ns-check-box" aria-hidden />
                      <span>{ns}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
