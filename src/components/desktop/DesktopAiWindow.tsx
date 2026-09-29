import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { setDesktopAiHost } from "../../lib/desktopEmbedHost";
import { DesktopAppWindow } from "./DesktopAppWindow";

type Props = {
  subtitle?: string | null;
};

/** Hosts the existing AI Linux chat. Does not start a second conversation. */
export function DesktopAiWindow({ subtitle }: Props) {
  const { t } = useTranslation("tools");
  const setHost = useCallback((el: HTMLDivElement | null) => {
    setDesktopAiHost(el);
  }, []);

  return (
    <DesktopAppWindow
      appId="aiLinux"
      title={t("desktop.appAiLinux")}
      subtitle={subtitle}
      panelTestId="host-ai-linux-panel"
      floatTestId="host-ai-linux-float"
      minimizeTestId="host-ai-linux-minimize"
      maximizeTestId="host-ai-linux-maximize"
      closeTestId="host-ai-linux-close"
      bodyClassName="desktop-embed-body"
    >
      <div
        ref={setHost}
        className="desktop-embed-host"
        data-testid="desktop-ai-host"
      />
    </DesktopAppWindow>
  );
}
