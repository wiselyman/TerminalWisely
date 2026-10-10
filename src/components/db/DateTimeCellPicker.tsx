import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { cellEditorValue } from "./workbenchModel";

export type DateTimePickerKind = "time" | "date" | "datetime";

type Props = {
  kind: DateTimePickerKind;
  initial: unknown;
  /** Cell rect so the popup is fixed outside clipped grid overflow. */
  anchorRect: DOMRect | null;
  testId?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseParts(kind: Props["kind"], raw: unknown): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const now = new Date();
  const text = cellEditorValue(kind, raw);
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let day = now.getDate();
  let hour = 0;
  let minute = 0;
  let second = 0;
  if (kind === "time") {
    const m = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      hour = Number(m[1]);
      minute = Number(m[2]);
      second = Number(m[3] ?? "0");
    }
  } else if (kind === "date") {
    const m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      year = Number(m[1]);
      month = Number(m[2]);
      day = Number(m[3]);
    }
  } else {
    const normalized = text.replace(" ", "T");
    const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      year = Number(m[1]);
      month = Number(m[2]);
      day = Number(m[3]);
      hour = Number(m[4]);
      minute = Number(m[5]);
      second = Number(m[6] ?? "0");
    }
  }
  return { year, month, day, hour, minute, second };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}

function formatValue(
  kind: Props["kind"],
  parts: ReturnType<typeof parseParts>,
): string {
  if (kind === "time") {
    return `${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
  }
  if (kind === "date") {
    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  }
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
}

function positionFor(anchor: DOMRect | null, width: number, height: number): { top: number; left: number } {
  const margin = 8;
  const aw = anchor?.width ?? 0;
  const ah = anchor?.height ?? 0;
  const ax = anchor?.left ?? margin;
  const ay = anchor?.bottom ?? margin;
  let left = ax;
  let top = ay + 4;
  if (left + width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - width - margin);
  }
  if (top + height > window.innerHeight - margin) {
    top = Math.max(margin, (anchor?.top ?? margin) - height - 4);
  }
  if (left < margin) left = margin;
  if (aw > 0 && ah > 0 && left === ax && top === ay + 4) {
    /* keep below-left of cell */
  }
  return { top, left };
}

/** Navicat-style date / time / datetime cell popup (calendar + digital time + OK/Cancel). */
export function DateTimeCellPicker({
  kind,
  initial,
  anchorRect,
  testId,
  onCommit,
  onCancel,
}: Props) {
  const { t } = useTranslation(["shell", "common"]);
  const [parts, setParts] = useState(() => parseParts(kind, initial));
  const [viewYear, setViewYear] = useState(parts.year);
  const [viewMonth, setViewMonth] = useState(parts.month);
  const [coords, setCoords] = useState(() => positionFor(anchorRect, 300, 280));

  useLayoutEffect(() => {
    const width = kind === "datetime" ? 420 : kind === "date" ? 280 : 220;
    const height = kind === "datetime" ? 300 : kind === "date" ? 280 : 160;
    setCoords(positionFor(anchorRect, width, height));
  }, [anchorRect, kind]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const calendarCells = useMemo(() => {
    const first = new Date(viewYear, viewMonth - 1, 1);
    const startPad = first.getDay(); // Sun=0
    const total = daysInMonth(viewYear, viewMonth);
    const cells: Array<{ day: number | null }> = [];
    for (let i = 0; i < startPad; i += 1) cells.push({ day: null });
    for (let d = 1; d <= total; d += 1) cells.push({ day: d });
    while (cells.length % 7 !== 0) cells.push({ day: null });
    return cells;
  }, [viewYear, viewMonth]);

  const showCalendar = kind === "date" || kind === "datetime";
  const showTime = kind === "time" || kind === "datetime";
  const display = formatValue(kind, parts);

  function bumpTime(field: "hour" | "minute" | "second", delta: number) {
    setParts((current) => {
      const next = { ...current };
      if (field === "hour") next.hour = (next.hour + delta + 24) % 24;
      if (field === "minute") next.minute = (next.minute + delta + 60) % 60;
      if (field === "second") next.second = (next.second + delta + 60) % 60;
      return next;
    });
  }

  function shiftMonth(delta: number) {
    let month = viewMonth + delta;
    let year = viewYear;
    if (month < 1) {
      month = 12;
      year -= 1;
    } else if (month > 12) {
      month = 1;
      year += 1;
    }
    setViewMonth(month);
    setViewYear(year);
  }

  const popup = (
    <>
      <button
        type="button"
        className="db-cell-picker-backdrop"
        data-testid="db-cell-picker-backdrop"
        aria-label={t("common:cancel")}
        onClick={onCancel}
      />
      <div
        className={`db-cell-picker db-cell-picker--${kind}`}
        data-testid={testId ?? "db-cell-picker"}
        data-picker-kind={kind}
        role="dialog"
        aria-label={t("dbCellPickerTitle")}
        style={{ top: coords.top, left: coords.left }}
      >
        <div className="db-cell-picker-body">
          {showCalendar ? (
            <div className="db-cell-picker-calendar" data-testid="db-cell-picker-calendar">
              <div className="db-cell-picker-cal-head">
                <span>
                  {viewYear}
                  {t("dbCellPickerYearMonthSep")}
                  {viewMonth}
                  {t("dbCellPickerMonthSuffix")}
                </span>
                <span className="db-cell-picker-cal-nav">
                  <button type="button" aria-label={t("dbCellPickerPrevMonth")} onClick={() => shiftMonth(-1)}>
                    ‹
                  </button>
                  <button type="button" aria-label={t("dbCellPickerNextMonth")} onClick={() => shiftMonth(1)}>
                    ›
                  </button>
                </span>
              </div>
              <div className="db-cell-picker-weekdays">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                  <span key={label}>{t(`dbCellPickerWeekday.${label}`)}</span>
                ))}
              </div>
              <div className="db-cell-picker-days">
                {calendarCells.map((cell, index) => {
                  if (cell.day == null) {
                    return <span key={`e-${index}`} className="db-cell-picker-day is-empty" />;
                  }
                  const selected =
                    cell.day === parts.day && viewMonth === parts.month && viewYear === parts.year;
                  return (
                    <button
                      key={cell.day}
                      type="button"
                      className={`db-cell-picker-day${selected ? " is-selected" : ""}`}
                      onClick={() => {
                        setParts((current) => ({
                          ...current,
                          year: viewYear,
                          month: viewMonth,
                          day: cell.day as number,
                        }));
                      }}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {showTime ? (
            <div className="db-cell-picker-time" data-testid="db-cell-picker-time">
              <div className="db-cell-picker-time-fields">
                {(
                  [
                    ["hour", parts.hour],
                    ["minute", parts.minute],
                    ["second", parts.second],
                  ] as const
                ).map(([field, value], index) => (
                  <span key={field} className="db-cell-picker-time-unit">
                    {index > 0 ? <span className="db-cell-picker-time-sep">:</span> : null}
                    <input
                      data-testid={`db-cell-picker-${field}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      value={pad2(value)}
                      onChange={(event) => {
                        const n = Number.parseInt(event.target.value.replace(/\D/g, ""), 10);
                        if (!Number.isFinite(n)) return;
                        setParts((current) => {
                          const next = { ...current };
                          if (field === "hour") next.hour = Math.min(23, Math.max(0, n));
                          if (field === "minute") next.minute = Math.min(59, Math.max(0, n));
                          if (field === "second") next.second = Math.min(59, Math.max(0, n));
                          return next;
                        });
                      }}
                    />
                    <span className="db-cell-picker-stepper">
                      <button type="button" tabIndex={-1} onClick={() => bumpTime(field, 1)}>
                        ▲
                      </button>
                      <button type="button" tabIndex={-1} onClick={() => bumpTime(field, -1)}>
                        ▼
                      </button>
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="db-cell-picker-footer">
          <input
            className="db-cell-picker-display"
            data-testid="db-cell-picker-display"
            value={display}
            onChange={(event) => {
              const parsed = parseParts(kind, event.target.value);
              const next =
                kind === "time"
                  ? parsed
                  : { ...parsed, day: clampDay(parsed.year, parsed.month, parsed.day) };
              setParts(next);
              if (kind !== "time") {
                setViewYear(next.year);
                setViewMonth(next.month);
              }
            }}
          />
          <div className="db-cell-picker-actions">
            <button type="button" data-testid="db-cell-picker-cancel" onClick={onCancel}>
              {t("common:cancel")}
            </button>
            <button
              type="button"
              className="find-panel-run primary"
              data-testid="db-cell-picker-ok"
              onClick={() => onCommit(formatValue(kind, parts))}
            >
              {t("dbCellPickerOk")}
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(popup, document.body);
}
