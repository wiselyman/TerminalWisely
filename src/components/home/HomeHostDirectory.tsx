import { useTranslation } from "react-i18next";
import type { SavedConnection } from "../../types";
import { ServerOsIcon } from "../ServerOsIcon";

export type HomeHostGroupInput = {
  key: string;
  name: string;
  hostIds: string[];
};

export type HomeHostSection = {
  key: string;
  name: string;
  hosts: SavedConnection[];
};

export function buildHomeHostSections(
  groups: HomeHostGroupInput[],
  savedConnections: SavedConnection[],
): HomeHostSection[] {
  const hostsById = new Map(savedConnections.map((host) => [host.id, host]));
  return groups.map((group) => ({
    key: group.key,
    name: group.name,
    hosts: group.hostIds
      .map((id) => hostsById.get(id))
      .filter((host): host is SavedConnection => host != null),
  }));
}

type Props = {
  groups: HomeHostGroupInput[];
  savedConnections: SavedConnection[];
  loading?: boolean;
  onOpenHost: (saved: SavedConnection) => void;
};

export function HomeHostDirectory({
  groups,
  savedConnections,
  loading = false,
  onOpenHost,
}: Props) {
  const { t } = useTranslation("shell");
  const sections = buildHomeHostSections(groups, savedConnections);

  return (
    <main className="home-host-directory" data-testid="home-host-directory">
      {loading ? <p className="home-host-directory-loading">{t("homeDirectoryLoading")}</p> : null}

      {sections.map((section) => (
        <section
          className="home-host-section"
          key={section.key}
          data-testid={`home-host-group-${section.key}`}
        >
          <header className="home-host-section-header">
            <h2>{section.name}</h2>
            <span>{t("homeDirectoryHostCount", { count: section.hosts.length })}</span>
          </header>
          <div className="home-host-card-grid">
            {section.hosts.length > 0 ? section.hosts.map((host) => (
              <button
                type="button"
                className="home-host-card"
                key={host.id}
                data-testid={`home-host-card-${host.id}`}
                onClick={() => onOpenHost(host)}
              >
                <span className="home-host-card-icon"><ServerOsIcon osId={host.os_id} osName={host.os_name} size={24} /></span>
                <span className="home-host-card-copy">
                  <strong>{host.name}</strong>
                  <small>{host.username}@{host.host}:{host.port}</small>
                </span>
              </button>
            )) : (
              <p className="home-host-section-empty">{t("homeDirectoryEmptyGroup")}</p>
            )}
          </div>
        </section>
      ))}
    </main>
  );
}
