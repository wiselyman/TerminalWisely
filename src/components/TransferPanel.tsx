import { TransferBar } from "./TransferBar";
import type { TransferProgressPayload } from "../types";

interface TransferPanelProps {
  transfers: TransferProgressPayload[];
  sessionTitles: Record<string, string>;
  onCancel: (transferId: string) => void;
}

export function TransferPanel({
  transfers,
  sessionTitles,
  onCancel,
}: TransferPanelProps) {
  if (transfers.length === 0) return null;

  return (
    <div className="transfer-panel" aria-live="polite">
      <div className="transfer-panel-head">
        <span className="transfer-panel-title">传输任务</span>
        <span className="transfer-panel-count">{transfers.length}</span>
      </div>
      <div className="transfer-panel-list">
        {transfers.map((progress) => (
          <TransferBar
            key={progress.transfer_id}
            progress={progress}
            sessionLabel={sessionTitles[progress.session_id]}
            onCancel={() => onCancel(progress.transfer_id)}
          />
        ))}
      </div>
    </div>
  );
}
