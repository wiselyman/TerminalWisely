import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { setDesktopTerminalHost } from "../../lib/desktopEmbedHost";
import { DesktopAppWindow } from "./DesktopAppWindow";

type Props = {
  subtitle?: string | null;
};

/** Hosts the existing SSH terminal. Does not open a second session. */
export function DesktopTerminalWindow({ subtitle }: Props) {
  const { t } = useTranslation("tools");
  const setHost = useCallback((el: HTMLDivElement | null) => {
    setDesktopTerminalHost(el);
  }, []);

  return (
    <DesktopAppWindow
      appId="terminal"
      title={t("desktop.appTerminal")}
      subtitle={subtitle}
      panelTestId="host-terminal-panel"
      floatTestId="host-terminal-float"
      minimizeTestId="host-terminal-minimize"
      maximizeTestId="host-terminal-maximize"
      closeTestId="host-terminal-close"
      bodyClassName="desktop-embed-body"
    >
      <div
        ref={setHost}
        className="desktop-embed-host"
        data-testid="desktop-terminal-host"
      />
    </DesktopAppWindow>
  );
}
