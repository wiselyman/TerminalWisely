import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { ClipboardPaste, Copy, MessageSquare } from "lucide-react";
import {
  armTerminalPointerSuppress,
  isSyntheticTerminalMouseEvent,
  releaseStaleXtermDocumentMouseListeners,
} from "../lib/terminalSelectionDrag";
import { ContextMenuItem } from "./ContextMenuItem";

const MENU_WIDTH = 236;
const MENU_MARGIN = 8;

function clampMenuLeft(left: number) {
  return Math.min(Math.max(MENU_MARGIN, left), window.innerWidth - MENU_WIDTH - MENU_MARGIN);
}

function computeMenuPosition(x: number, y: number, menuHeight: number) {
  const left = clampMenuLeft(x);
  let top = y + 6;
  if (top + menuHeight > window.innerHeight - MENU_MARGIN) {
    top = Math.max(MENU_MARGIN, y - menuHeight - 6);
  }
  return { top, left };
}

interface TerminalBlankContextMenuProps {
  x: number;
  y: number;
  canCopy: boolean;
  canSendToChat?: boolean;
  onClose: () => void;
  onCopy?: () => void;
  onSendToChat?: () => void;
  onPaste: () => void;
}

export function TerminalBlankContextMenu({
  x,
  y,
  canCopy,
  canSendToChat,
  onClose,
  onCopy,
  onSendToChat,
  onPaste,
}: TerminalBlankContextMenuProps) {
  const { t } = useTranslation("terminal");
  const menuRef = useRef<HTMLDivElement>(null);
  const openedAtRef = useRef(0);
  const [position, setPosition] = useState(() =>
    computeMenuPosition(x, y, 120),
  );

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const next = computeMenuPosition(x, y, el.offsetHeight);
    setPosition((prev) =>
      prev.top === next.top && prev.left === next.left ? prev : next,
    );
  }, [x, y]);

  useEffect(() => {
    openedAtRef.current = performance.now();

    const isNearOpenPoint = (event: MouseEvent) =>
      Math.hypot(event.clientX - x, event.clientY - y) <= 8;

    const swallowPointer = (event: MouseEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onDismiss = (event: MouseEvent) => {
      if (isSyntheticTerminalMouseEvent(event)) return;
      if (event.button !== 0) return;
      const elapsed = performance.now() - openedAtRef.current;
      if (elapsed < 250 && isNearOpenPoint(event)) {
        swallowPointer(event);
        armTerminalPointerSuppress(400);
        return;
      }
      if (menuRef.current?.contains(event.target as Node)) return;
      swallowPointer(event);
      armTerminalPointerSuppress(400);
      releaseStaleXtermDocumentMouseListeners({ armClickSuppress: false });
      onClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    let disposed = false;
    const timer = window.setTimeout(() => {
      if (disposed) return;
      document.addEventListener("mousedown", onDismiss, true);
      document.addEventListener("click", onDismiss, true);
      document.addEventListener("keydown", onKeyDown);
    }, 0);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDismiss, true);
      document.removeEventListener("click", onDismiss, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, x, y]);

  return createPortal(
    <div
      ref={menuRef}
      className="terminal-fs-context-menu tab-context-menu"
      role="menu"
      aria-label={t("blankMenuAria")}
      style={{
        top: position.top,
        left: position.left,
        width: MENU_WIDTH,
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <ContextMenuItem
        icon={Copy}
        disabled={!canCopy}
        onClick={() => {
          onCopy?.();
          onClose();
        }}
      >
        {t("copy")}
      </ContextMenuItem>
      {onSendToChat ? (
        <ContextMenuItem
          icon={MessageSquare}
          disabled={!canSendToChat}
          onClick={() => {
            onSendToChat();
            onClose();
          }}
        >
          {t("sendToChat")}
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem
        icon={ClipboardPaste}
        onClick={() => {
          onPaste();
          onClose();
        }}
      >
        {t("paste")}
      </ContextMenuItem>
    </div>,
    document.body,
  );
}
