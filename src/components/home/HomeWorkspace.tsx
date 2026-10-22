import { useTranslation } from "react-i18next";
import { AiEngineerPanel } from "../aiEngineer/AiEngineerPanel";
import { LocalTerminal } from "./LocalTerminal";
import { LOCAL_CHAT_SESSION } from "../../lib/aiEngineer/localTarget";

export function HomeWorkspace() {
  const { t } = useTranslation("terminal");
  return (
    <div className="home-local-chat" data-testid="home-local-chat">
      <section
        className="home-local-terminal-pane"
        aria-label={t("localTerminalTitle")}
      >
        <LocalTerminal />
      </section>
      <section className="home-work-chat" data-testid="home-work-chat">
        <AiEngineerPanel
          sessionId={LOCAL_CHAT_SESSION}
          placement="home"
          surfaceActive
        />
      </section>
    </div>
  );
}
