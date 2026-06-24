import { useMemo, useState } from "react";
import {
  describeSearchKeyword,
  findPreset,
  groupPresets,
  presetsForVariant,
  variantCustomLabel,
  variantSectionTitle,
  type SearchKeywordVariant,
} from "../lib/searchKeyword";

interface SearchKeywordInputProps {
  value: string;
  onChange: (value: string) => void;
  variant: SearchKeywordVariant;
}

export function SearchKeywordInput({
  value,
  onChange,
  variant,
}: SearchKeywordInputProps) {
  const [custom, setCustom] = useState(false);
  const presets = useMemo(() => presetsForVariant(variant), [variant]);
  const groups = useMemo(() => groupPresets(presets), [presets]);
  const preset = useMemo(() => findPreset(variant, value), [variant, value]);
  const description = useMemo(
    () => describeSearchKeyword(variant, value),
    [variant, value],
  );

  const selectPreset = (next: string) => {
    setCustom(false);
    onChange(next);
  };

  return (
    <div className="search-keyword-input">
      <span className="search-keyword-section-label">{variantSectionTitle(variant)}</span>
      {groups.map(({ group, items }) => (
        <div key={group} className="search-keyword-group">
          <span className="search-keyword-group-label">{group}</span>
          <div className="search-keyword-preset-grid">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`search-keyword-preset${
                  !custom && preset?.id === item.id ? " active" : ""
                }`}
                onClick={() => selectPreset(item.value)}
              >
                <span className="search-keyword-preset-label">{item.label}</span>
                <span className="search-keyword-preset-hint">{item.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="search-keyword-summary">
        <p className="search-keyword-summary-text">{description}</p>
        <label className="search-keyword-custom">
          <span>{variantCustomLabel(variant)}</span>
          <input
            type="text"
            value={value}
            placeholder={
              variant === "package"
                ? "例如 nginx"
                : variant === "file-content"
                  ? "例如 Exception"
                  : "例如 nginx.conf"
            }
            onChange={(event) => {
              setCustom(true);
              onChange(event.target.value);
            }}
          />
        </label>
      </div>
    </div>
  );
}
