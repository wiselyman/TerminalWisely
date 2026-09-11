import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { useSessionStore } from "../stores/sessionStore";
import { useToastStore } from "../stores/toastStore";
import { formatAppError } from "../lib/formatAppError";
import { PathInput } from "./PathInput";

export function SendToDialog() {
  const { t } = useTranslation("terminal");
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
        pushToast(formatAppError(err), false);
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
        <h3 id="send-to-title">{t("sendToTitle")}</h3>
        <p className="send-to-path">{fileLabel}</p>
        {targets.length === 0 ? (
          <p className="send-to-empty">{t("sendToEmpty")}</p>
        ) : (
          <>
            <p className="send-to-section-label">{t("sendToSelectTarget")}</p>
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
                <span>{t("sendToDestDir")}</span>
                <PathInput
                  sessionId={selectedTargetId}
                  value={remoteDir}
                  disabled={pending}
                  placeholder={t("destDirPlaceholder")}
                  onChange={setRemoteDir}
                />
                <span className="send-to-dir-hint">{t("sendToDestHint")}</span>
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
            {t("common:cancel")}
          </button>
          {targets.length > 0 ? (
            <button
              type="button"
              className="send-to-confirm"
              disabled={!selectedTargetId || pending}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={handleSend}
            >
              {pending ? t("sendToStarting") : t("sendToSubmit")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
