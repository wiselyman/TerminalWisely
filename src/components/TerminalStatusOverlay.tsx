interface TerminalStatusOverlayProps {
  message: string;
  subtitle?: string;
  fading?: boolean;
}

export function TerminalStatusOverlay({
  message,
  subtitle,
  fading = false,
}: TerminalStatusOverlayProps) {
  return (
    <div
      className={`terminal-status-overlay${fading ? " terminal-status-overlay-fading" : ""}`}
      aria-live="polite"
      aria-busy={!fading}
    >
      <div className="terminal-status-overlay-card">
        <div className="terminal-status-spinner" aria-hidden="true" />
        <p className="terminal-status-message">{message}</p>
        {subtitle ? (
          <p className="terminal-status-subtitle">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}
