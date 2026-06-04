import { productIntro } from "../content/productIntro";
import { SidebarActionIcon } from "./SidebarIcons";

export function WorkspaceWelcome() {
  return (
    <section className="workspace-welcome" aria-label="产品介绍">
      <div className="workspace-welcome-inner">
        <header className="workspace-welcome-hero">
          <p className="workspace-welcome-eyebrow">开源桌面终端</p>
          <h1>{productIntro.name}</h1>
          <p className="workspace-welcome-tagline">{productIntro.tagline}</p>
          <p className="workspace-welcome-summary">{productIntro.summary}</p>
        </header>

        <div className="workspace-welcome-grid">
          {productIntro.features.map((feature) => (
            <article key={feature.title} className="workspace-welcome-card">
              <h2>{feature.title}</h2>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>

        <section className="workspace-welcome-steps">
          <h2>快速开始</h2>
          <ol>
            {productIntro.steps.map((step) => (
              <li key={step.text}>
                <SidebarActionIcon kind={step.icon} label={step.iconLabel} />
                <span>{step.text}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </section>
  );
}
