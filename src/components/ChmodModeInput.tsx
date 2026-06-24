import { useMemo, useState } from "react";
import {
  CHMOD_PRESETS,
  bitsToOctal,
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

const ROWS: { key: keyof ChmodBits; label: string }[] = [
  { key: "owner", label: "所有者" },
  { key: "group", label: "用户组" },
  { key: "other", label: "其他人" },
];

const COLS: { key: "r" | "w" | "x"; label: string }[] = [
  { key: "r", label: "读" },
  { key: "w", label: "写" },
  { key: "x", label: "执行" },
];

const DEFAULT_BITS = octalToBits("644")!;

export function ChmodModeInput({ value, onChange }: ChmodModeInputProps) {
  const [custom, setCustom] = useState(false);

  const bits = useMemo(() => octalToBits(value) ?? DEFAULT_BITS, [value]);
  const preset = useMemo(() => findPresetByMode(value), [value]);
  const description = useMemo(() => describeChmodMode(value), [value]);

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
        <span className="chmod-mode-section-label">常用场景</span>
        <div className="chmod-mode-preset-grid">
          {CHMOD_PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chmod-mode-preset${!custom && preset?.id === item.id ? " active" : ""}`}
              onClick={() => selectPreset(item.mode)}
            >
              <span className="chmod-mode-preset-label">{item.label}</span>
              <span className="chmod-mode-preset-hint">{item.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="chmod-mode-grid-wrap">
        <span className="chmod-mode-section-label">细调权限</span>
        <table className="chmod-mode-grid" role="grid">
          <thead>
            <tr>
              <th />
              {COLS.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                {COLS.map((col) => (
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
          <span>数字代码（高级）</span>
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
        <p className="chmod-mode-footnote">
          数字由「读=4、写=2、执行=1」相加而成，一般选上面场景即可，无需记忆。
        </p>
      </div>
    </div>
  );
}
