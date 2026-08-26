import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "../i18n";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
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
      return (
        <div className="app-fatal-error">
          <h1>{i18n.t("errors:renderCrashTitle")}</h1>
          <p>{this.state.error.message}</p>
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
      );
    }

    return this.props.children;
  }
}
