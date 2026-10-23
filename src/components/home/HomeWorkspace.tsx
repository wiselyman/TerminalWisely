import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { AiEngineerPanel } from "../aiEngineer/AiEngineerPanel";
import { LocalTerminal } from "./LocalTerminal";
import { LOCAL_CHAT_SESSION } from "../../lib/aiEngineer/localTarget";
import {
  clampHomeSplitRatio,
  DEFAULT_HOME_SPLIT_RATIO,
  parseHomeSplitRatio,
} from "./homeSplit";

const HOME_TERMINAL_RATIO_KEY = "tw.home-terminal-ratio";
const SPLIT_KEYBOARD_STEP = 0.02;

type HomeTerminalTab = { id: string; title: string };

function readSavedRatio(): number {
  try {
    return parseHomeSplitRatio(window.localStorage.getItem(HOME_TERMINAL_RATIO_KEY));
  } catch {
    return DEFAULT_HOME_SPLIT_RATIO;
  }
}

export function HomeWorkspace({
  terminalTabs,
  activeTerminalId,
  chatOpen,
}: {
  terminalTabs: HomeTerminalTab[];
  activeTerminalId: string;
  chatOpen: boolean;
}) {
  const { t } = useTranslation("terminal");
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [terminalRatio, setTerminalRatio] = useState(readSavedRatio);

  const setRatio = useCallback((value: number) => {
    const next = clampHomeSplitRatio(value);
    setTerminalRatio(next);
    try {
      window.localStorage.setItem(HOME_TERMINAL_RATIO_KEY, String(next));
    } catch {
      // Keep resizing available when storage is disabled.
    }
  }, []);

  const updateRatioAt = useCallback((clientX: number) => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    setRatio((clientX - bounds.left) / bounds.width);
  }, [setRatio]);

  useEffect(() => () => document.body.classList.remove("workspace-resizing"), []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("workspace-resizing");
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.body.classList.remove("workspace-resizing");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = terminalRatio - SPLIT_KEYBOARD_STEP;
    if (event.key === "ArrowRight") next = terminalRatio + SPLIT_KEYBOARD_STEP;
    if (event.key === "Home") next = 0.2;
    if (event.key === "End") next = 0.8;
    if (next == null) return;
    event.preventDefault();
    setRatio(next);
  };

  return (
    <div
      ref={workspaceRef}
      className={`home-local-chat${chatOpen ? "" : " is-chat-collapsed"}`}
      data-testid="home-local-chat"
      style={{
        gridTemplateColumns: chatOpen
          ? `minmax(0, ${terminalRatio}fr) 8px minmax(0, ${1 - terminalRatio}fr)`
          : "minmax(0, 1fr)",
      }}
    >
      <section
        id="home-local-terminal-pane"
        className="home-local-terminal-pane"
        aria-label={t("localTerminalTitle")}
      >
        {terminalTabs.map((tab) => (
          <div
            key={tab.id}
            className={`home-terminal-instance${tab.id === activeTerminalId ? " active" : ""}`}
            data-terminal-id={tab.id}
            aria-hidden={tab.id !== activeTerminalId}
          >
            <LocalTerminal />
          </div>
        ))}
      </section>
      <div
        className="home-local-splitter"
        data-testid="home-split-resizer"
        role="separator"
        aria-label={t("homeSplitAria")}
        aria-orientation="vertical"
        aria-controls="home-local-terminal-pane home-local-chat-pane"
        aria-hidden={!chatOpen}
        tabIndex={chatOpen ? 0 : -1}
        aria-valuemin={20}
        aria-valuemax={80}
        aria-valuenow={Math.round(terminalRatio * 100)}
        aria-valuetext={t("homeSplitValue", { percent: Math.round(terminalRatio * 100) })}
        onPointerDown={onPointerDown}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            updateRatioAt(event.clientX);
          }
        }}
        onPointerUp={onPointerUp}
        onLostPointerCapture={() => document.body.classList.remove("workspace-resizing")}
        onKeyDown={onKeyDown}
      />
      <section
        id="home-local-chat-pane"
        className="home-work-chat"
        data-testid="home-work-chat"
        aria-hidden={!chatOpen}
      >
        <AiEngineerPanel
          sessionId={LOCAL_CHAT_SESSION}
          placement="home"
          surfaceActive
        />
      </section>
    </div>
  );
}
