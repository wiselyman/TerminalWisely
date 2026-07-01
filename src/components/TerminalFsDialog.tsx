import { useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { useToastStore } from "../stores/toastStore";
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
  const pushToast = useToastStore((s) => s.pushToast);
  const [pending, setPending] = useState(false);
  const [newName, setNewName] = useState(basename(path));
  const [destDir, setDestDir] = useState("");

  const refreshListing = async () => {
    await invoke("enter_directory", {
      request: { session_id: sessionId, path: "." },
    });
  };

  const handleConfirm = async () => {
    setPending(true);
    try {
      if (mode === "rename") {
        const trimmed = newName.trim();
        if (!trimmed) {
          pushToast("请输入新名称", false);
          return;
        }
        await invoke("rename_path", {
          request: { session_id: sessionId, path, new_name: trimmed },
        });
        pushToast("已重命名", true);
      } else if (mode === "delete") {
        await invoke("delete_path", {
          request: { session_id: sessionId, path },
        });
        pushToast("已删除", true);
      } else {
        const trimmed = destDir.trim();
        if (!trimmed) {
          pushToast("请输入目标目录", false);
          return;
        }
        await invoke("move_path", {
          request: { session_id: sessionId, path, dest_dir: trimmed },
        });
        pushToast("已移动", true);
      }
      await refreshListing();
      onClose();
    } catch (err) {
      pushToast(String(err), false);
    } finally {
      setPending(false);
    }
  };

  const title =
    mode === "rename" ? "重命名" : mode === "delete" ? "删除" : "移动到目录";

  const pathLabel =
    path.length > 56 ? `…${path.slice(-53)}` : path;

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

        {mode === "rename" ? (
          <label className="terminal-fs-field">
            <span>新名称</span>
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

        {mode === "delete" ? (
          <p className="terminal-fs-confirm">
            {pathKind === "directory"
              ? "确定要删除此目录及其全部内容吗？此操作不可撤销。"
              : "确定要删除此文件吗？此操作不可撤销。"}
          </p>
        ) : null}

        {mode === "move" ? (
          <label className="terminal-fs-field">
            <span>目标目录</span>
            <PathInput
              sessionId={sessionId}
              value={destDir}
              disabled={pending}
              placeholder="输入目标目录路径"
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
            取消
          </button>
          <button
            type="button"
            className="terminal-fs-btn terminal-fs-btn-primary"
            disabled={pending}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => void handleConfirm()}
          >
            {pending ? "处理中…" : "确认"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
