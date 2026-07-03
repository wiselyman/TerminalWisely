import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { useSessionStore } from "../stores/sessionStore";
import { useToastStore } from "../stores/toastStore";
import { PathInput } from "./PathInput";

export function SendToDialog() {
  const sendTo = useSessionStore((s) => s.sendTo);
  const closeSendTo = useSessionStore((s) => s.closeSendTo);
  const transferRemote = useSessionStore((s) => s.transferRemote);
  const tabs = useSessionStore((s) => s.tabs);
  const pushToast = useToastStore((s) => s.pushToast);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [remoteDir, setRemoteDir] = useState("");
  const [pending, setPending] = useState(false);

  const targets = sendTo
    ? tabs.filter(
        (tab) => tab.kind === "ssh" && tab.id !== sendTo.fromSessionId,
      )
    : [];

  useEffect(() => {
    if (!sendTo) {
      setSelectedTargetId(null);
      setRemoteDir("");
      setPending(false);
      return;
    }
    if (targets.length === 1) {
      setSelectedTargetId(targets[0].id);
    }
  }, [sendTo, targets]);

  useEffect(() => {
    if (!selectedTargetId) {
      setRemoteDir("");
      return;
    }
    let cancelled = false;
    void invoke<string>("get_session_cwd", {
      request: { session_id: selectedTargetId },
    })
      .then((cwd) => {
        if (!cancelled) setRemoteDir(cwd || "");
      })
      .catch(() => {
        if (!cancelled) setRemoteDir("");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTargetId]);

  if (!sendTo) return null;

  const fileLabel =
    sendTo.remotePath.length > 48
      ? `…${sendTo.remotePath.slice(-45)}`
      : sendTo.remotePath;

  const handleSend = () => {
    if (!selectedTargetId || pending) return;
    setPending(true);
    void transferRemote(selectedTargetId, remoteDir.trim() || null)
      .catch((err) => {
        pushToast(String(err), false);
      })
      .finally(() => {
        setPending(false);
      });
  };

  const dialog = (
    <div
      className="send-to-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          closeSendTo();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !pending) closeSendTo();
      }}
    >
      <div
        className="send-to-dialog"
        role="dialog"
        aria-labelledby="send-to-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 id="send-to-title">发送到其他服务器</h3>
        <p className="send-to-path">{fileLabel}</p>
        {targets.length === 0 ? (
          <p className="send-to-empty">没有其他 SSH 连接，请先打开目标服务器。</p>
        ) : (
          <>
            <p className="send-to-section-label">选择目标服务器</p>
            <ul className="send-to-list">
              {targets.map((tab) => {
                const selected = selectedTargetId === tab.id;
                return (
                  <li key={tab.id}>
                    <button
                      type="button"
                      className={`send-to-item${selected ? " send-to-item-selected" : ""}`}
                      disabled={pending}
                      aria-pressed={selected}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={() => setSelectedTargetId(tab.id)}
                    >
                      <span className="tab-kind ssh">SSH</span>
                      <span>{tab.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {selectedTargetId ? (
              <label className="terminal-fs-field send-to-dir-field">
                <span>目标目录</span>
                <PathInput
                  sessionId={selectedTargetId}
                  value={remoteDir}
                  disabled={pending}
                  placeholder="输入目标目录路径"
                  onChange={setRemoteDir}
                />
                <span className="send-to-dir-hint">
                  留空则使用目标会话当前目录；输入时可 Tab 补全路径。
                </span>
              </label>
            ) : null}
          </>
        )}
        <div className="send-to-actions">
          <button
            type="button"
            className="send-to-cancel"
            disabled={pending}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={closeSendTo}
          >
            取消
          </button>
          {targets.length > 0 ? (
            <button
              type="button"
              className="send-to-confirm"
              disabled={!selectedTargetId || pending}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={handleSend}
            >
              {pending ? "正在启动传输…" : "发送"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
