import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CHMOD_PRESETS,
  bitsToOctal,
  chmodPresetHint,
  chmodPresetLabel,
  describeChmodMode,
  findPresetByMode,
  isValidChmodMode,
  octalToBits,
  type ChmodBits,
} from "../lib/chmodMode";

interface ChmodModeInputProps {
  value: string;
  onChange: (value: string) => void;
}

const ROW_KEYS: { key: keyof ChmodBits; labelKey: string }[] = [
  { key: "owner", labelKey: "chmod.owner" },
  { key: "group", labelKey: "chmod.group" },
  { key: "other", labelKey: "chmod.other" },
];

const COL_KEYS: { key: "r" | "w" | "x"; labelKey: string }[] = [
  { key: "r", labelKey: "chmod.read" },
  { key: "w", labelKey: "chmod.write" },
  { key: "x", labelKey: "chmod.execute" },
];

const DEFAULT_BITS = octalToBits("644")!;

export function ChmodModeInput({ value, onChange }: ChmodModeInputProps) {
  const { t, i18n } = useTranslation("commands");
  const [custom, setCustom] = useState(false);

  const bits = useMemo(() => octalToBits(value) ?? DEFAULT_BITS, [value]);
  const preset = useMemo(() => findPresetByMode(value), [value]);
  const description = useMemo(
    () => describeChmodMode(t, value),
    [t, value, i18n.language],
  );

  const selectPreset = (mode: string) => {
    setCustom(false);
    onChange(mode);
  };

  const toggleBit = (row: keyof ChmodBits, col: "r" | "w" | "x") => {
    setCustom(true);
    const next: ChmodBits = {
      owner: { ...bits.owner },
      group: { ...bits.group },
      other: { ...bits.other },
    };
    next[row] = { ...next[row], [col]: !next[row][col] };
    onChange(bitsToOctal(next));
  };

  const onCustomInput = (next: string) => {
    setCustom(true);
    onChange(next.replace(/[^0-7]/g, "").slice(0, 3));
  };

  return (
    <div className="chmod-mode-input">
      <div className="chmod-mode-presets">
        <span className="chmod-mode-section-label">{t("chmod.sectionPresets")}</span>
        <div className="chmod-mode-preset-grid">
          {CHMOD_PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chmod-mode-preset${!custom && preset?.id === item.id ? " active" : ""}`}
              onClick={() => selectPreset(item.mode)}
            >
              <span className="chmod-mode-preset-label">{chmodPresetLabel(t, item)}</span>
              <span className="chmod-mode-preset-hint">{chmodPresetHint(t, item)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="chmod-mode-grid-wrap">
        <span className="chmod-mode-section-label">{t("chmod.sectionAdjust")}</span>
        <table className="chmod-mode-grid" role="grid">
          <thead>
            <tr>
              <th />
              {COL_KEYS.map((col) => (
                <th key={col.key}>{t(col.labelKey)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROW_KEYS.map((row) => (
              <tr key={row.key}>
                <th scope="row">{t(row.labelKey)}</th>
                {COL_KEYS.map((col) => (
                  <td key={col.key}>
                    <label className="chmod-mode-check">
                      <input
                        type="checkbox"
                        checked={bits[row.key][col.key]}
                        onChange={() => toggleBit(row.key, col.key)}
                      />
                      <span className="chmod-mode-check-box" />
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="chmod-mode-summary">
        <p className="chmod-mode-summary-text">{description}</p>
        <label className="chmod-mode-custom">
          <span>{t("chmod.advancedLabel")}</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={3}
            value={value}
            placeholder="644"
            className={isValidChmodMode(value) ? "" : "invalid"}
            onChange={(event) => onCustomInput(event.target.value)}
          />
        </label>
        <p className="chmod-mode-footnote">{t("chmod.footnote")}</p>
      </div>
    </div>
  );
}
