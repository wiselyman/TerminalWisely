import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ChevronDown, Search } from "lucide-react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  CREATE_RESOURCE_TEMPLATE_GROUPS,
  type K8sCreateTemplateGroupId,
  type K8sCreateTemplateId,
} from "../../lib/k8s/createResource";

type K8sTemplatePickerProps = {
  value: K8sCreateTemplateId;
  onChange: (templateId: K8sCreateTemplateId) => void;
  "aria-label"?: string;
  className?: string;
};

/** Searchable grouped template picker (Lens-style Select Template). */
export function K8sTemplatePicker({
  value,
  onChange,
  className,
  "aria-label": ariaLabel,
}: K8sTemplatePickerProps) {
  const { t } = useTranslation("k8s");
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CREATE_RESOURCE_TEMPLATE_GROUPS.map((group) => ({
      ...group,
      templates: group.templates.filter((templateId) =>
        q ? templateId.toLowerCase().includes(q) : true,
      ),
    })).filter((group) => group.templates.length > 0);
  }, [query]);

  const resultCount = filteredGroups.reduce(
    (sum, group) => sum + group.templates.length,
    0,
  );

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const menuMax = 420;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUp = spaceBelow < 280 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(
      menuMax,
      openUp ? spaceAbove : spaceBelow,
    );
    setMenuStyle({
      position: "fixed",
      left: Math.min(rect.left, window.innerWidth - 320),
      width: Math.max(rect.width, 280),
      maxHeight: Math.max(160, maxHeight),
      zIndex: 10050,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [open, query, value]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
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
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const groupLabel = (groupId: K8sCreateTemplateGroupId) =>
    t(`createResourceTemplateGroup.${groupId}`);

  return (
    <div
      className={`k8s-template-picker${className ? ` ${className}` : ""}${open ? " open" : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="k8s-template-picker-trigger"
        data-testid="k8s-create-resource-template-picker"
        aria-label={ariaLabel ?? t("createResourceSelectTemplate")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="k8s-template-picker-value">
          {value || t("createResourceSelectTemplate")}
        </span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden />
      </button>
      {open
        ? createPortal(
            <div
              id={listId}
              className="k8s-template-picker-menu"
              role="listbox"
              ref={menuRef}
              style={menuStyle}
            >
              <div className="k8s-template-picker-search">
                <Search size={14} strokeWidth={2} aria-hidden />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  placeholder={t("createResourceTemplateSearch")}
                  aria-label={t("createResourceTemplateSearch")}
                  data-testid="k8s-create-resource-template-search"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className="k8s-template-picker-results">
                {resultCount === 0 ? (
                  <p className="k8s-template-picker-empty">
                    {t("createResourceTemplateEmpty")}
                  </p>
                ) : (
                  filteredGroups.map((group) => (
                    <div key={group.id} className="k8s-template-picker-group">
                      <div className="k8s-template-picker-group-label">
                        {groupLabel(group.id)}
                      </div>
                      {group.templates.map((templateId) => (
                        <button
                          key={templateId}
                          type="button"
                          role="option"
                          aria-selected={templateId === value}
                          className={
                            templateId === value
                              ? "k8s-template-picker-option selected"
                              : "k8s-template-picker-option"
                          }
                          onClick={() => {
                            onChange(templateId);
                            setOpen(false);
                            setQuery("");
                          }}
                        >
                          {templateId}
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
