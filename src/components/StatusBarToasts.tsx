import { Check, CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToastStore } from "../stores/toastStore";

/** Renders the latest toast(s) on the status bar far right. */
export function StatusBarToasts() {
  const { t } = useTranslation("terminal");
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);
  const pushToast = useToastStore((s) => s.pushToast);
  // Show newest first; keep at most 2 so the bar stays readable.
  const visible = [...toasts].reverse().slice(0, 2);

  if (visible.length === 0) {
    return (
      <div className="statusbar-toasts" aria-live="polite" aria-atomic="true" />
    );
  }

  return (
    <div className="statusbar-toasts" aria-live="polite" aria-atomic="true">
      {visible.map((toast) => (
        <div
          key={toast.id}
          className={`statusbar-toast ${toast.success ? "is-ok" : "is-err"}`}
          title={
            toast.success
              ? toast.message
              : `${toast.message}\n${t("toastErrorClickHint")}`
          }
          role="status"
          data-testid={toast.success ? "statusbar-toast-ok" : "statusbar-toast-err"}
          onClick={
            toast.success
              ? undefined
              : () => {
                  void navigator.clipboard?.writeText(toast.message).then(
                    () => {
                      pushToast(t("toastCopiedError"), true);
                    },
                    () => {
                      /* clipboard unavailable — title still has full text */
                    },
                  );
                }
          }
        >
          {toast.success ? (
            <Check className="statusbar-toast-icon" size={12} strokeWidth={1.75} aria-hidden />
          ) : (
            <CircleAlert className="statusbar-toast-icon" size={12} strokeWidth={1.75} aria-hidden />
          )}
          <span className="statusbar-toast-msg">{toast.message}</span>
          {toast.actionLabel && toast.onAction ? (
            <button
              type="button"
              className="statusbar-toast-action"
              data-testid="statusbar-toast-action"
              onClick={(event) => {
                event.stopPropagation();
                toast.onAction?.();
                removeToast(toast.id);
              }}
            >
              {toast.actionLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="statusbar-toast-close"
            onClick={(event) => {
              event.stopPropagation();
              removeToast(toast.id);
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
