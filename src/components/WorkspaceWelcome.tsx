import { useTranslation } from "react-i18next";
import { SidebarActionIcon, type SidebarActionKind } from "./SidebarIcons";

const FEATURE_KEYS = [
  "dragUpload",
  "clickBrowse",
  "contextTransfer",
  "tabShortcuts",
  "bookmarksTransfer",
  "hostStats",
  "find",
  "taskManager",
  "commandNav",
] as const;

const STEPS: Array<{ key: "local" | "ssh" | "bookmark"; icon: SidebarActionKind }> = [
  { key: "local", icon: "local" },
  { key: "ssh", icon: "ssh" },
  { key: "bookmark", icon: "bookmark" },
];

export function WorkspaceWelcome() {
  const { t } = useTranslation("welcome");

  return (
    <section className="workspace-welcome" aria-label={t("sectionAria")}>
      <div className="workspace-welcome-inner">
        <header className="workspace-welcome-hero">
          <p className="workspace-welcome-eyebrow">{t("eyebrow")}</p>
          <h1>{t("productName")}</h1>
          <p className="workspace-welcome-tagline">{t("tagline")}</p>
          <p className="workspace-welcome-summary">{t("summary")}</p>
        </header>

        <div className="workspace-welcome-grid">
          {FEATURE_KEYS.map((key) => (
            <article key={key} className="workspace-welcome-card">
              <h2>{t(`feature.${key}.title`)}</h2>
              <p>{t(`feature.${key}.desc`)}</p>
            </article>
          ))}
        </div>

        <section className="workspace-welcome-steps">
          <h2>{t("quickStart")}</h2>
          <ol>
            {STEPS.map((step) => (
              <li key={step.key}>
                <SidebarActionIcon
                  kind={step.icon}
                  label={t(`step.${step.key}.iconLabel`)}
                />
                <span>{t(`step.${step.key}.text`)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </section>
  );
}
