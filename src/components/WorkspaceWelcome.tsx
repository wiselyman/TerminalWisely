import { useTranslation } from "react-i18next";
import { K8sClusterIcon } from "./k8s/K8sClusterIcon";
import { SidebarActionIcon } from "./SidebarIcons";
import { DatabaseIcon } from "./WorkspaceToolIcons";

const FEATURE_KEYS = ["hosts", "kubernetes", "databases", "ai", "safety"] as const;

const STEPS = [
  { key: "hosts", icon: "ssh" },
  { key: "kubernetes", icon: "k8s" },
  { key: "databases", icon: "db" },
] as const;

export function WorkspaceWelcome() {
  const { t } = useTranslation("welcome");

  return (
    <section className="workspace-welcome" aria-label={t("sectionAria")} data-testid="workspace-welcome">
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
                {step.icon === "ssh" ? (
                  <SidebarActionIcon kind="ssh" label={t(`step.${step.key}.iconLabel`)} />
                ) : (
                  <span className="sidebar-action-icon" title={t(`step.${step.key}.iconLabel`)}>
                    {step.icon === "k8s" ? <K8sClusterIcon size={16} /> : <DatabaseIcon />}
                  </span>
                )}
                <span>{t(`step.${step.key}.text`)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </section>
  );
}
