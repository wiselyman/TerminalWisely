import { createPortal } from "react-dom";
import { formatSizeBytes, formatSizeHuman } from "../lib/formatSize";
import type { PathSizeResult } from "../types";

interface PathSizeDialogProps {
  path: string;
  pathKind: "file" | "directory";
  loading: boolean;
  result: PathSizeResult | null;
  error: string | null;
  onClose: () => void;
}

export function PathSizeDialog({
  path,
  pathKind,
  loading,
  result,
  error,
  onClose,
}: PathSizeDialogProps) {
  const title = pathKind === "directory" ? "文件夹大小" : "文件大小";
  const pathLabel = path.length > 72 ? `…${path.slice(-69)}` : path;

  const dialog = (
    <div
      className="send-to-backdrop path-size-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !loading) onClose();
      }}
    >
      <div
        className="send-to-dialog path-size-dialog"
        role="dialog"
        aria-labelledby="path-size-dialog-title"
        aria-busy={loading}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 id="path-size-dialog-title">{title}</h3>
        <p className="send-to-path path-size-path">{pathLabel}</p>

        {loading ? (
          <div className="path-size-body path-size-loading">
            <div className="path-size-spinner" aria-hidden="true" />
            <p>正在计算大小…</p>
          </div>
        ) : error ? (
          <p className="path-size-error">{error}</p>
        ) : result ? (
          <div className="path-size-body">
            <p className="path-size-value">{formatSizeHuman(result.size_bytes)}</p>
            <p className="path-size-bytes">{formatSizeBytes(result.size_bytes)}</p>
          </div>
        ) : null}

        <div className="terminal-fs-actions path-size-actions">
          <button
            type="button"
            className="terminal-fs-btn terminal-fs-btn-primary"
            disabled={loading}
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
