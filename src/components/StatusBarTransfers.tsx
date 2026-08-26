/** Compact transfer rows for the bottom status bar (right cluster). */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Send, Upload, X } from "lucide-react";
import {
  formatRateCompact,
} from "../lib/hostStatsFormat";
import {
  formatTransferPercent,
} from "../lib/transferFormat";
import { useSessionStore } from "../stores/sessionStore";
import type { TransferProgressPayload } from "../types";

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === "upload") return <Upload size={14} strokeWidth={1.5} aria-hidden />;
  if (direction === "send") return <Send size={14} strokeWidth={1.5} aria-hidden />;
  return <Download size={14} strokeWidth={1.5} aria-hidden />;
}

function StatusTransferChip({
  progress,
  onCancel,
}: {
  progress: TransferProgressPayload;
  onCancel: () => void;
}) {
  const { t } = useTranslation("tools");
  const [speedBps, setSpeedBps] = useState(0);
  const sampleRef = useRef({ transferred: 0, at: Date.now() });

  useEffect(() => {
    sampleRef.current = { transferred: 0, at: Date.now() };
    setSpeedBps(0);
  }, [progress.transfer_id, progress.filename, progress.direction]);

  useEffect(() => {
    const now = Date.now();
    const prev = sampleRef.current;
    const elapsedSec = (now - prev.at) / 1000;
    const delta = progress.transferred - prev.transferred;
    if (elapsedSec >= 0.25 && delta >= 0) {
      const instant = delta / elapsedSec;
      setSpeedBps((current) =>
        current === 0 ? instant : current * 0.65 + instant * 0.35,
      );
    }
    sampleRef.current = { transferred: progress.transferred, at: now };
  }, [progress.transferred]);

  const percent = formatTransferPercent(progress.transferred, progress.total);
  const speedLabel = speedBps > 0 ? formatRateCompact(speedBps) : null;

  const title = [
    progress.filename,
    percent !== null ? `${percent}%` : null,
    speedLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span className="statusbar-transfer" title={title}>
      <DirectionIcon direction={progress.direction} />
      <span className="statusbar-transfer-name">{progress.filename}</span>
      {percent !== null ? (
        <span className="statusbar-transfer-pct">{percent}%</span>
      ) : (
        <span className="statusbar-transfer-pct is-muted">{t("transfer.preparing")}</span>
      )}
      {speedLabel ? (
        <span className="statusbar-transfer-speed">{speedLabel}</span>
      ) : null}
      <span className="statusbar-transfer-track" aria-hidden>
        <span
          className={`statusbar-transfer-fill${
            progress.total > 0 && progress.transferred === 0
              ? " is-indeterminate"
              : ""
          }`}
          style={
            percent === null || (progress.total > 0 && progress.transferred === 0)
              ? undefined
              : { width: `${percent}%` }
          }
        />
      </span>
      <button
        type="button"
        className="statusbar-transfer-cancel"
        aria-label={t("transfer.cancelTransfer")}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => void onCancel()}
      >
        <X size={12} strokeWidth={1.75} aria-hidden />
      </button>
    </span>
  );
}

/** Active uploads/downloads — lives in the status bar right cluster. */
export function StatusBarTransfers() {
  const transfersMap = useSessionStore((s) => s.activeTransfers);
  const cancelTransfer = useSessionStore((s) => s.cancelTransfer);
  const transfers = useMemo(
    () => Object.values(transfersMap),
    [transfersMap],
  );

  if (transfers.length === 0) return null;

  // One compact chip; +N if more transfers are active.
  const visible = transfers.slice(-1);
  const hidden = transfers.length - visible.length;

  return (
    <div className="statusbar-transfers" aria-live="polite">
      {hidden > 0 ? (
        <span className="statusbar-transfer-more" title={`${transfers.length} transfers`}>
          +{hidden}
        </span>
      ) : null}
      {visible.map((progress) => (
        <StatusTransferChip
          key={progress.transfer_id}
          progress={progress}
          onCancel={() => void cancelTransfer(progress.transfer_id)}
        />
      ))}
    </div>
  );
}
