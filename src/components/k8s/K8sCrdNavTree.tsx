import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { groupCrdCatalog } from "../../lib/k8s/navigation";
import type { K8sCrdBrowseContext, K8sCrdCatalogEntry } from "../../lib/k8s/types";

type Props = {
  catalog: K8sCrdCatalogEntry[];
  loading: boolean;
  expandedGroups: Set<string>;
  activeBrowse: K8sCrdBrowseContext | null;
  onToggleGroup: (group: string) => void;
  onSelectCrd: (entry: K8sCrdCatalogEntry) => void;
  onSelectDefinitions: () => void;
  definitionsActive: boolean;
};

export function K8sCrdNavTree({
  catalog,
  loading,
  expandedGroups,
  activeBrowse,
  onToggleGroup,
  onSelectCrd,
  onSelectDefinitions,
  definitionsActive,
}: Props) {
  const { t } = useTranslation("k8s");
  const grouped = groupCrdCatalog(catalog);

  return (
    <div className="k8s-tree-crd" role="group">
      <button
        type="button"
        className={`k8s-tree-item k8s-tree-item-nested${definitionsActive ? " active" : ""}`}
        onClick={onSelectDefinitions}
      >
        <span>{t("category.customresourcedefinitions")}</span>
      </button>
      {loading && catalog.length === 0 ? (
        <p className="k8s-tree-crd-loading">{t("loading")}</p>
      ) : null}
      {[...grouped.entries()].map(([group, entries]) => {
        const open = expandedGroups.has(group);
        return (
          <div key={group} className={`k8s-tree-crd-group${open ? " open" : ""}`}>
            <button
              type="button"
              className="k8s-tree-crd-group-label"
              aria-expanded={open}
              onClick={() => onToggleGroup(group)}
            >
              {open ? (
                <ChevronDown size={11} strokeWidth={2} />
              ) : (
                <ChevronRight size={11} strokeWidth={2} />
              )}
              <span>{group}</span>
            </button>
            {open ? (
              <div className="k8s-tree-crd-children" role="group">
                {entries.map((entry) => {
                  const active =
                    activeBrowse?.crdName === entry.name &&
                    activeBrowse.plural === entry.plural;
                  return (
                    <button
                      key={entry.name}
                      type="button"
                      className={`k8s-tree-item k8s-tree-item-crd${active ? " active" : ""}`}
                      title={entry.name}
                      onClick={() => onSelectCrd(entry)}
                    >
                      <span>{entry.kind || entry.plural}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
