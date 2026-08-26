import { Check, CircleAlert } from "lucide-react";
import { useToastStore } from "../stores/toastStore";

/** Renders the latest toast(s) on the status bar far right. */
export function StatusBarToasts() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);
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
          title={toast.message}
          role="status"
        >
          {toast.success ? (
            <Check className="statusbar-toast-icon" size={12} strokeWidth={1.75} aria-hidden />
          ) : (
            <CircleAlert className="statusbar-toast-icon" size={12} strokeWidth={1.75} aria-hidden />
          )}
          <span className="statusbar-toast-msg">{toast.message}</span>
          <button
            type="button"
            className="statusbar-toast-close"
            onClick={() => removeToast(toast.id)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
