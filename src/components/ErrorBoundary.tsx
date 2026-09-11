import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "../i18n";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function isQuotaError(error: Error | null): boolean {
  if (!error) return false;
  const msg = `${error.name} ${error.message}`.toLowerCase();
  return (
    msg.includes("quota") ||
    msg.includes("exceeded") ||
    error.name === "QuotaExceededError"
  );
}

function clearHeavyLocalStorage() {
  try {
    localStorage.removeItem("tw.aiEngineer.chatByScope.v1");
  } catch {
    /* ignore */
  }
  try {
    // Last resort so the shell can boot; chat history may need re-open from backups.
    const raw = localStorage.getItem("tw.aiEngineer.chatByScope.v2");
    if (raw && raw.length > 1_500_000) {
      localStorage.removeItem("tw.aiEngineer.chatByScope.v2");
    }
  } catch {
    try {
      localStorage.removeItem("tw.aiEngineer.chatByScope.v2");
    } catch {
      /* ignore */
    }
  }
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("TerminalWisely render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const quota = isQuotaError(this.state.error);
      return (
        <div className="app-fatal-error">
          <h1>{i18n.t("errors:renderCrashTitle")}</h1>
          <p>
            {quota
              ? i18n.t("errors:quotaExceededHint")
              : this.state.error.message}
          </p>
          <div className="app-fatal-error-actions">
            {quota ? (
              <button
                type="button"
                onClick={() => {
                  clearHeavyLocalStorage();
                  this.setState({ error: null });
                  window.location.reload();
                }}
              >
                {i18n.t("errors:clearChatCacheReload")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
            >
              {i18n.t("errors:reload")}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
