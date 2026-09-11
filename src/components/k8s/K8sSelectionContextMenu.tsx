import { Copy, MessageSquare } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  x: number;
  y: number;
  text: string;
  testIdPrefix: string;
  onCopy: (text: string) => void;
  onSendToChat?: (text: string) => void;
  onClose: () => void;
};

/** Fixed-position Copy / Send-to-chat menu for logs + k8s terminals. */
export function K8sSelectionContextMenu({
  x,
  y,
  text,
  testIdPrefix,
  onCopy,
  onSendToChat,
  onClose,
}: Props) {
  const { t } = useTranslation("terminal");
  const trimmed = text.trim();

  useEffect(() => {
    const dismiss = (e: Event) => {
      if (e instanceof MouseEvent) {
        const target = e.target as HTMLElement | null;
        if (target?.closest(".k8s-terminal-selection-menu")) return;
      }
      onClose();
    };
    window.addEventListener("mousedown", dismiss);
    window.addEventListener("keydown", dismiss);
    return () => {
      window.removeEventListener("mousedown", dismiss);
      window.removeEventListener("keydown", dismiss);
    };
  }, [onClose]);

  if (!trimmed) return null;

  return (
    <div
      className="k8s-terminal-selection-menu"
      role="menu"
      style={{ top: y, left: x }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        data-testid={`${testIdPrefix}-copy`}
        onClick={() => {
          onCopy(trimmed);
          onClose();
        }}
      >
        <Copy size={13} strokeWidth={2} aria-hidden />
        {t("copy")}
      </button>
      {onSendToChat ? (
        <button
          type="button"
          role="menuitem"
          data-testid={`${testIdPrefix}-send-chat`}
          onClick={() => {
            onSendToChat(trimmed);
            onClose();
          }}
        >
          <MessageSquare size={13} strokeWidth={2} aria-hidden />
          {t("sendToChat")}
        </button>
      ) : null}
    </div>
  );
}
