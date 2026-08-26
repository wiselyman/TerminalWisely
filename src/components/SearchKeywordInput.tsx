import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  describeSearchKeyword,
  findPreset,
  groupPresets,
  presetGroupLabel,
  presetHint,
  presetLabel,
  presetsForVariant,
  variantCustomLabel,
  variantPlaceholder,
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
  const { t, i18n } = useTranslation("commands");
  const [custom, setCustom] = useState(false);
  const presets = useMemo(() => presetsForVariant(variant), [variant]);
  const groups = useMemo(() => groupPresets(presets), [presets]);
  const preset = useMemo(() => findPreset(variant, value), [variant, value]);
  const description = useMemo(
    () => describeSearchKeyword(t, variant, value),
    [t, variant, value, i18n.language],
  );

  const selectPreset = (next: string) => {
    setCustom(false);
    onChange(next);
  };

  return (
    <div className="search-keyword-input">
      <span className="search-keyword-section-label">
        {variantSectionTitle(t, variant)}
      </span>
      {groups.map(({ groupKey, items }) => (
        <div key={groupKey} className="search-keyword-group">
          <span className="search-keyword-group-label">
            {presetGroupLabel(t, groupKey)}
          </span>
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
                <span className="search-keyword-preset-label">
                  {presetLabel(t, item)}
                </span>
                <span className="search-keyword-preset-hint">{presetHint(t, item)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="search-keyword-summary">
        <p className="search-keyword-summary-text">{description}</p>
        <label className="search-keyword-custom">
          <span>{variantCustomLabel(t, variant)}</span>
          <input
            type="text"
            value={value}
            placeholder={variantPlaceholder(t, variant)}
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
