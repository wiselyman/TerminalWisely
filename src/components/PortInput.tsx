import { useMemo, useState } from "react";
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
  const [custom, setCustom] = useState(false);
  const groups = useMemo(() => groupPortPresets(), []);
  const description = useMemo(
    () => describePort(value, optional),
    [optional, value],
  );

  const selectPort = (port: string) => {
    setCustom(false);
    onChange(port);
  };

  return (
    <div className="port-input">
      <span className="search-keyword-section-label">常见端口</span>
      {groups.map(({ group, items }) => (
        <div key={group} className="search-keyword-group">
          <span className="search-keyword-group-label">{group}</span>
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
                <span className="search-keyword-preset-hint">{item.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="search-keyword-summary">
        <p className="search-keyword-summary-text">{description}</p>
        <label className="search-keyword-custom">
          <span>{optional ? "或输入端口号（可留空）" : "或输入端口号"}</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={value}
            placeholder={optional ? "留空=全部" : "8080"}
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
