import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { isSudoRequiredError } from "../stores/previewStore";
import { useToastStore } from "../stores/toastStore";
import { formatAppError } from "../lib/formatAppError";
import { PathInput } from "./PathInput";

export type TerminalFsDialogMode = "rename" | "delete" | "move";

interface TerminalFsDialogProps {
  mode: TerminalFsDialogMode;
  sessionId: string;
  path: string;
  pathKind: "file" | "directory";
  onClose: () => void;
}

function basename(path: string): string {
  return path.split("/").pop() || path.split("\\").pop() || path;
}

export function TerminalFsDialog({
  mode,
  sessionId,
  path,
  pathKind,
  onClose,
}: TerminalFsDialogProps) {
  const { t } = useTranslation("terminal");
  const pushToast = useToastStore((s) => s.pushToast);
  const [pending, setPending] = useState(false);
  const [newName, setNewName] = useState(basename(path));
  const [destDir, setDestDir] = useState("");
  const [needsSudo, setNeedsSudo] = useState(false);
  const [sudoPassword, setSudoPassword] = useState("");

  const refreshListing = async () => {
    await invoke("enter_directory", {
      request: { session_id: sessionId, path: "." },
    });
  };

  const handleConfirm = async () => {
    if (needsSudo && !sudoPassword.trim()) {
      pushToast(t("toastNeedSudoPassword"), false);
      return;
    }

    setPending(true);
    try {
      const sudo_password = needsSudo ? sudoPassword : undefined;

      if (mode === "rename") {
        const trimmed = newName.trim();
        if (!trimmed) {
          pushToast(t("toastNeedNewName"), false);
          return;
        }
        await invoke("rename_path", {
          request: {
            session_id: sessionId,
            path,
            new_name: trimmed,
            sudo_password,
          },
        });
        pushToast(t("toastRenamed"), true);
      } else if (mode === "delete") {
        await invoke("delete_path", {
          request: { session_id: sessionId, path, sudo_password },
        });
        pushToast(t("toastDeleted"), true);
      } else {
        const trimmed = destDir.trim();
        if (!trimmed) {
          pushToast(t("toastNeedDestDir"), false);
          return;
        }
        await invoke("move_path", {
          request: {
            session_id: sessionId,
            path,
            dest_dir: trimmed,
            sudo_password,
          },
        });
        pushToast(t("toastMoved"), true);
      }
      await refreshListing();
      onClose();
    } catch (err) {
      const message = String(err);
      if (isSudoRequiredError(message)) {
        setNeedsSudo(true);
      } else {
        pushToast(formatAppError(err), false);
      }
    } finally {
      setPending(false);
    }
  };

  const title =
    mode === "rename" ? t("rename") : mode === "delete" ? t("delete") : t("moveToDir");

  const pathLabel = path.length > 56 ? `…${path.slice(-53)}` : path;

  const dialog = (
    <div
      className="send-to-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !pending) onClose();
      }}
    >
      <div
        className="send-to-dialog terminal-fs-dialog"
        role="dialog"
        aria-labelledby="terminal-fs-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 id="terminal-fs-dialog-title">{title}</h3>
        <p className="send-to-path">{pathLabel}</p>

        {needsSudo ? (
          <>
            <p className="modal-hint">{t("fsDialogSudoHint")}</p>
            <label className="terminal-fs-field">
              <span>{t("sudoPassword")}</span>
              <input
                type="password"
                value={sudoPassword}
                disabled={pending}
                autoFocus
                onChange={(event) => setSudoPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleConfirm();
                  }
                }}
              />
            </label>
          </>
        ) : null}

        {!needsSudo && mode === "rename" ? (
          <label className="terminal-fs-field">
            <span>{t("newName")}</span>
            <input
              type="text"
              value={newName}
              disabled={pending}
              autoFocus
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleConfirm();
                }
              }}
            />
          </label>
        ) : null}

        {!needsSudo && mode === "delete" ? (
          <p className="terminal-fs-confirm">
            {pathKind === "directory"
              ? t("deleteDirConfirm")
              : t("deleteFileConfirm")}
          </p>
        ) : null}

        {!needsSudo && mode === "move" ? (
          <label className="terminal-fs-field">
            <span>{t("destDir")}</span>
            <PathInput
              sessionId={sessionId}
              value={destDir}
              disabled={pending}
              placeholder={t("destDirPlaceholder")}
              onChange={setDestDir}
            />
          </label>
        ) : null}

        <div className="terminal-fs-actions">
          <button
            type="button"
            className="terminal-fs-btn"
            disabled={pending}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClose}
          >
            {t("common:cancel")}
          </button>
          <button
            type="button"
            className="terminal-fs-btn terminal-fs-btn-primary"
            disabled={pending}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => void handleConfirm()}
          >
            {pending
              ? t("common:processing")
              : needsSudo
                ? t("confirmWithSudo")
                : t("common:confirm")}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
