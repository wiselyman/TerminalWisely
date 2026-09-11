import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";

export type LocalFsDialogMode = "rename" | "move" | "delete";

interface LocalFsDialogProps {
  mode: LocalFsDialogMode;
  path: string;
  pathKind: "file" | "directory";
  currentDir: string;
  onClose: () => void;
  onDone: () => void;
}

function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export function LocalFsDialog({
  mode,
  path,
  pathKind,
  currentDir,
  onClose,
  onDone,
}: LocalFsDialogProps) {
  const { t } = useTranslation("tools");
  const [pending, setPending] = useState(false);
  const [newName, setNewName] = useState(basename(path));
  const [destDir, setDestDir] = useState(currentDir);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNewName(basename(path));
    setDestDir(currentDir);
    setError(null);
  }, [path, currentDir, mode]);

  const handleConfirm = async () => {
    setPending(true);
    setError(null);
    try {
      if (mode === "rename") {
        const trimmed = newName.trim();
        if (!trimmed) {
          setError(t("localFs.needName"));
          return;
        }
        await invoke("rename_local_path", {
          request: { path, new_name: trimmed },
        });
      } else if (mode === "delete") {
        await invoke("delete_local_path", { request: { path } });
      } else {
        const trimmed = destDir.trim();
        if (!trimmed) {
          setError(t("localFs.needDest"));
          return;
        }
        await invoke("move_local_path", {
          request: { path, dest_dir: trimmed },
        });
      }
      onDone();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setPending(false);
    }
  };

  const title =
    mode === "rename"
      ? t("localFs.renameTitle")
      : mode === "move"
        ? t("localFs.moveTitle")
        : t("localFs.deleteTitle");

  const dialog = (
    <div className="send-to-backdrop" onClick={onClose}>
      <div
        className="send-to-dialog local-fs-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="send-to-title">{title}</h3>
        <p className="local-fs-dialog-path">{path}</p>
        {mode === "rename" ? (
          <label className="local-fs-dialog-field">
            <span>{t("localFs.newName")}</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
          </label>
        ) : null}
        {mode === "move" ? (
          <label className="local-fs-dialog-field">
            <span>{t("localFs.destDir")}</span>
            <input
              value={destDir}
              onChange={(e) => setDestDir(e.target.value)}
              autoFocus
            />
          </label>
        ) : null}
        {mode === "delete" ? (
          <p className="local-fs-dialog-hint">
            {pathKind === "directory"
              ? t("localFs.deleteDirHint")
              : t("localFs.deleteFileHint")}
          </p>
        ) : null}
        {error ? <p className="local-fs-dialog-error">{error}</p> : null}
        <div className="send-to-actions">
          <button type="button" className="find-panel-run" onClick={onClose}>
            {t("localFs.cancel")}
          </button>
          <button
            type="button"
            className="find-panel-run primary"
            disabled={pending}
            onClick={() => void handleConfirm()}
          >
            {pending ? t("localFs.working") : t("localFs.confirm")}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
