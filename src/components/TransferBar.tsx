import { useEffect, useRef, useState } from "react";
import {
  formatMegabytes,
  formatSpeedMbps,
  formatTransferDirection,
  formatTransferPercent,
} from "../lib/transferFormat";
import type { TransferProgressPayload } from "../types";

interface TransferBarProps {
  progress: TransferProgressPayload;
  sessionLabel?: string;
  onCancel: () => void;
}

export function TransferBar({ progress, sessionLabel, onCancel }: TransferBarProps) {
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
  const hasTotal = progress.total > 0;
  const indeterminate = hasTotal && progress.transferred === 0;
  const speedLabel = formatSpeedMbps(speedBps);

  const sizeLabel = hasTotal
    ? `${formatMegabytes(progress.transferred)} / ${formatMegabytes(progress.total)}`
    : progress.transferred > 0
      ? formatMegabytes(progress.transferred)
      : null;

  const metricParts = [sizeLabel, speedLabel, percent !== null ? `${percent}%` : null].filter(
    Boolean,
  );

  return (
    <div className="transfer-bar">
      <div className="transfer-bar-main">
        <div className="transfer-bar-head">
          <span className="transfer-bar-label">
            {formatTransferDirection(progress.direction)} · {progress.filename}
            {sessionLabel ? (
              <span className="transfer-bar-session"> · {sessionLabel}</span>
            ) : null}
          </span>
          <span className="transfer-bar-metrics">
            {metricParts.length > 0 ? metricParts.join(" · ") : "准备中…"}
          </span>
        </div>
        <div className="transfer-bar-track" aria-hidden="true">
          <div
            className={`transfer-bar-fill${indeterminate ? " transfer-bar-fill-indeterminate" : ""}`}
            style={
              indeterminate || percent === null
                ? undefined
                : { width: `${percent}%` }
            }
          />
        </div>
      </div>
      <button
        type="button"
        className="transfer-bar-cancel"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => {
          void onCancel();
        }}
      >
        取消传输
      </button>
    </div>
  );
}
