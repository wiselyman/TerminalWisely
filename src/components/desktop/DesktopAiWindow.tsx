import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { setDesktopAiHost } from "../../lib/desktopEmbedHost";
import { DesktopAppWindow } from "./DesktopAppWindow";

type Props = {
  target: "local" | "ssh";
  subtitle?: string | null;
};

/** Hosts an existing local or SSH chat without starting another conversation. */
export function DesktopAiWindow({ target, subtitle }: Props) {
  const { t } = useTranslation("tools");
  const local = target === "local";
  const setHost = useCallback((el: HTMLDivElement | null) => {
    setDesktopAiHost(el);
  }, []);

  return (
    <DesktopAppWindow
      appId={local ? "aiLocal" : "aiLinux"}
      title={t(local ? "desktop.appAiLocal" : "desktop.appAiLinux")}
      subtitle={subtitle}
      panelTestId={local ? "home-ai-local-panel" : "host-ai-linux-panel"}
      floatTestId={local ? "home-ai-local-float" : "host-ai-linux-float"}
      minimizeTestId={local ? "home-ai-local-minimize" : "host-ai-linux-minimize"}
      maximizeTestId={local ? "home-ai-local-maximize" : "host-ai-linux-maximize"}
      closeTestId={local ? "home-ai-local-close" : "host-ai-linux-close"}
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
