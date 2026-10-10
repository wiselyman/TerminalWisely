import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  FILTER_OPS,
  type FilterJoin,
  type FilterOp,
  type FilterRule,
} from "./workbenchModel";

type Props = {
  columns: string[];
  filterRules: FilterRule[];
  onFilterRulesChange: (rules: FilterRule[]) => void;
  onApply: () => void;
  seedFocusId?: string | null;
};

function newFilterId(): string {
  return crypto.randomUUID();
}

export function emptyFilterRule(column: string): FilterRule {
  return {
    id: newFilterId(),
    enabled: true,
    column,
    op: "eq",
    value: "",
    join: "and",
  };
}

function opNeedsValue(op: FilterOp): boolean {
  return op !== "is_null" && op !== "is_not_null";
}

/** Navicat-style filter conditions only — sort stays on column headers. */
export function FilterSortPane({
  columns,
  filterRules,
  onFilterRulesChange,
  onApply,
  seedFocusId = null,
}: Props) {
  const { t } = useTranslation("shell");
  const defaultColumn = columns[0] ?? "";

  function patchFilter(id: string, patch: Partial<FilterRule>) {
    onFilterRulesChange(filterRules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  }

  return (
    <div className="db-filter-sort-pane" data-testid="db-filter-sort-pane">
      <div className="db-filter-sort-section">
        <div className="db-filter-sort-heading">{t("dbFilterSection")}</div>
        {filterRules.length === 0 ? (
          <p className="db-filter-sort-hint">{t("dbFilterAddHint")}</p>
        ) : null}
        {filterRules.map((rule, index) => (
          <div key={rule.id} className="db-filter-rule" data-testid={`db-filter-rule-${rule.id}`}>
            {index > 0 ? (
              <select
                className="db-filter-join"
                data-testid={`db-filter-join-${rule.id}`}
                value={rule.join}
                aria-label={t("dbFilterJoin")}
                onChange={(event) => patchFilter(rule.id, { join: event.target.value as FilterJoin })}
              >
                <option value="and">{t("dbFilterAnd")}</option>
                <option value="or">{t("dbFilterOr")}</option>
              </select>
            ) : (
              <span className="db-filter-join-spacer" aria-hidden="true" />
            )}
            <input
              type="checkbox"
              checked={rule.enabled}
              data-testid={`db-filter-enabled-${rule.id}`}
              aria-label={t("dbFilterEnabled")}
              onChange={(event) => patchFilter(rule.id, { enabled: event.target.checked })}
            />
            <select
              data-testid={`db-filter-column-${rule.id}`}
              value={rule.column}
              aria-label={t("dbFilterColumn")}
              onChange={(event) => patchFilter(rule.id, { column: event.target.value })}
            >
              {columns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
            <select
              data-testid={`db-filter-op-${rule.id}`}
              value={rule.op}
              aria-label={t("dbFilterOp")}
              onChange={(event) => patchFilter(rule.id, { op: event.target.value as FilterOp })}
            >
              {FILTER_OPS.map((op) => (
                <option key={op} value={op}>
                  {t(`dbFilterOp_${op}`)}
                </option>
              ))}
            </select>
            {opNeedsValue(rule.op) ? (
              <input
                data-testid={`db-filter-value-${rule.id}`}
                value={rule.value}
                autoFocus={seedFocusId === rule.id}
                aria-label={t("dbFilterValue")}
                onChange={(event) => patchFilter(rule.id, { value: event.target.value })}
              />
            ) : (
              <span className="db-filter-value-spacer" aria-hidden="true" />
            )}
            <button
              type="button"
              className="db-filter-remove"
              data-testid={`db-filter-remove-${rule.id}`}
              aria-label={t("dbFilterRemove")}
              onClick={() => onFilterRulesChange(filterRules.filter((item) => item.id !== rule.id))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="db-filter-add"
          data-testid="db-filter-add"
          disabled={!defaultColumn}
          aria-label={t("dbFilterAdd")}
          onClick={() => onFilterRulesChange([...filterRules, emptyFilterRule(defaultColumn)])}
        >
          <Plus size={12} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        className="db-action-btn db-action-btn--primary db-filter-apply"
        data-testid="db-filter-apply"
        onClick={onApply}
      >
        {t("dbApplyFilter")}
      </button>
    </div>
  );
}
