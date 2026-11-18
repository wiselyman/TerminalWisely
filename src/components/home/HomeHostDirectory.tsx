import { useRef, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { startEntityPointerReorder } from "../../lib/entityPointerReorder";
import type { EntityDropTarget } from "../../lib/entityPointerReorder";
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
  onItemDrop: (dragId: string, target: EntityDropTarget) => void;
};

export function HomeHostDirectory({
  groups,
  savedConnections,
  loading = false,
  onOpenHost,
  onItemDrop,
}: Props) {
  const { t } = useTranslation("shell");
  const listRef = useRef<HTMLElement>(null);
  const sections = buildHomeHostSections(groups, savedConnections);

  return (
    <main className="home-host-directory" data-testid="home-host-directory" ref={listRef}>
      {loading ? <p className="home-host-directory-loading">{t("homeDirectoryLoading")}</p> : null}

      {sections.map((section) => (
        <section
          className="home-host-section"
          key={section.key}
          data-testid={`home-host-group-${section.key}`}
        >
          <header className="home-host-section-header" data-entity-group-id={section.key}>
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
                data-entity-item-id={host.id}
                onMouseDown={(event: ReactMouseEvent<HTMLButtonElement>) => {
                  if (event.button !== 0) return;
                  const listRoot = listRef.current;
                  if (!listRoot) return;
                  startEntityPointerReorder({
                    dragId: host.id,
                    dragKind: "item",
                    rowElement: event.currentTarget,
                    listRoot,
                    startX: event.clientX,
                    startY: event.clientY,
                    onPreview: () => {},
                    onDrop: (target) => onItemDrop(host.id, target),
                  });
                }}
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
