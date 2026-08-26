import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  describePort,
  groupPortPresets,
} from "../lib/commonPorts";

interface PortInputProps {
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
}

export function PortInput({ value, onChange, optional = false }: PortInputProps) {
  const { t, i18n } = useTranslation("commands");
  const [custom, setCustom] = useState(false);
  const groups = useMemo(() => groupPortPresets(), []);
  const description = useMemo(
    () => describePort(t, value, optional),
    [optional, t, value, i18n.language],
  );

  const selectPort = (port: string) => {
    setCustom(false);
    onChange(port);
  };

  return (
    <div className="port-input">
      <span className="search-keyword-section-label">{t("ports.sectionCommon")}</span>
      {groups.map(({ groupKey, items }) => (
        <div key={groupKey} className="search-keyword-group">
          <span className="search-keyword-group-label">{t(`ports.group.${groupKey}`)}</span>
          <div className="search-keyword-preset-grid">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`search-keyword-preset${
                  !custom && value === item.port ? " active" : ""
                }`}
                onClick={() => selectPort(item.port)}
              >
                <span className="search-keyword-preset-label">
                  {item.label} ({item.port})
                </span>
                <span className="search-keyword-preset-hint">
                  {t(`ports.hint.${item.hintKey}`)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="search-keyword-summary">
        <p className="search-keyword-summary-text">{description}</p>
        <label className="search-keyword-custom">
          <span>{optional ? t("ports.orEnterOptional") : t("ports.orEnter")}</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={value}
            placeholder={optional ? t("ports.placeholderOptional") : "8080"}
            onChange={(event) => {
              setCustom(true);
              onChange(event.target.value.replace(/\D/g, "").slice(0, 5));
            }}
          />
        </label>
      </div>
    </div>
  );
}
