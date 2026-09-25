import { forwardRef } from "react";
import { useAiEngineerStore } from "../../stores/aiEngineerStore";

type TextareaProps = {
  placeholder: string;
  disabled: boolean;
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
};

/**
 * Isolates Zustand `input` so keystrokes do not re-render the full chat panel
 * (transcript + markdown + tool cards).
 */
export const AiEngineerComposerTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaProps
>(function AiEngineerComposerTextarea(
  { placeholder, disabled, onPaste, onSubmit },
  ref,
) {
  const input = useAiEngineerStore((s) => s.input);
  const setInput = useAiEngineerStore((s) => s.setInput);
  return (
    <textarea
      ref={ref}
      value={input}
      onChange={(e) => setInput(e.target.value)}
      placeholder={placeholder}
      rows={3}
      disabled={disabled}
      onPaste={onPaste}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onSubmit();
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onSubmit();
        }
      }}
    />
  );
});

type SendProps = {
  busy: boolean;
  ready: boolean;
  modelConfigured: boolean;
  stopLabel: string;
  sendLabel: string;
  onStop: () => void;
  onSend: () => void;
};

/** Send/stop control that alone re-reads draft emptiness on keystrokes. */
export function AiEngineerComposerSendButton({
  busy,
  ready,
  modelConfigured,
  stopLabel,
  sendLabel,
  onStop,
  onSend,
}: SendProps) {
  const hasDraft = useAiEngineerStore(
    (s) => s.input.trim().length > 0 || s.pendingAttachments.length > 0,
  );
  if (busy) {
    return (
      <button
        type="button"
        className="ai-engineer-composer-submit is-stop"
        aria-label={stopLabel}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onStop}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
          <rect x="4.5" y="4.5" width="7" height="7" rx="1.25" fill="currentColor" />
        </svg>
      </button>
    );
  }
  return (
    <button
      type="button"
      className="ai-engineer-composer-submit is-send"
      aria-label={sendLabel}
      disabled={!ready || !modelConfigured || !hasDraft}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSend}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
        <path
          fill="currentColor"
          d="M8 3.25 12.75 8H9.75v4.25H6.25V8H3.25L8 3.25Z"
        />
      </svg>
    </button>
  );
}
