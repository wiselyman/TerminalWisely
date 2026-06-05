import { useState } from "react";
import { createPortal } from "react-dom";
import { useSessionStore } from "../stores/sessionStore";
import { useToastStore } from "../stores/toastStore";

export function SendToDialog() {
  const sendTo = useSessionStore((s) => s.sendTo);
  const closeSendTo = useSessionStore((s) => s.closeSendTo);
  const transferRemote = useSessionStore((s) => s.transferRemote);
  const tabs = useSessionStore((s) => s.tabs);
  const pushToast = useToastStore((s) => s.pushToast);
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);

  if (!sendTo) return null;

  const targets = tabs.filter(
    (tab) => tab.kind === "ssh" && tab.id !== sendTo.fromSessionId,
  );

  const fileLabel =
    sendTo.remotePath.length > 48
      ? `…${sendTo.remotePath.slice(-45)}`
      : sendTo.remotePath;

  const dialog = (
    <div
      className="send-to-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeSendTo();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") closeSendTo();
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
          <ul className="send-to-list">
            {targets.map((tab) => (
              <li key={tab.id}>
                <button
                  type="button"
                  className="send-to-item"
                  disabled={pendingTargetId !== null}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    setPendingTargetId(tab.id);
                    void transferRemote(tab.id)
                      .catch((err) => {
                        pushToast(String(err), false);
                      })
                      .finally(() => {
                        setPendingTargetId(null);
                      });
                  }}
                >
                  <span className="tab-kind ssh">SSH</span>
                  <span>
                    {pendingTargetId === tab.id ? "正在启动传输…" : tab.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="send-to-cancel"
          disabled={pendingTargetId !== null}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={closeSendTo}
        >
          关闭
        </button>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
