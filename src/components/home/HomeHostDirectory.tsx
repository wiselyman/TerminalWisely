import { useRef, useState, type MouseEvent as ReactMouseEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, FolderPlus, Pencil, Trash2, X } from "lucide-react";
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
  onEditHost: (saved: SavedConnection) => void;
  onDeleteHost: (saved: SavedConnection) => void;
  onAddGroup: () => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
};

export function HomeHostDirectory({
  groups,
  savedConnections,
  loading = false,
  onOpenHost,
  onItemDrop,
  onEditHost,
  onDeleteHost,
  onAddGroup,
  onRenameGroup,
  onDeleteGroup,
}: Props) {
  const { t } = useTranslation("shell");
  const listRef = useRef<HTMLElement>(null);
  const [editingGroup, setEditingGroup] = useState<{ id: string; name: string } | null>(null);
  const sections = buildHomeHostSections(groups, savedConnections);

  return (
    <main className="home-host-directory" data-testid="home-host-directory" ref={listRef}>
      <div className="home-host-directory-toolbar">
        <button type="button" className="home-host-add-group" data-testid="home-add-group" onClick={onAddGroup}>
          <FolderPlus size={16} aria-hidden="true" />
          {t("entityAddGroup")}
        </button>
      </div>
      {loading ? <p className="home-host-directory-loading">{t("homeDirectoryLoading")}</p> : null}

      {sections.map((section) => (
        <section
          className="home-host-section"
          key={section.key}
          data-testid={`home-host-group-${section.key}`}
          data-entity-group-id={section.key}
        >
          <header className="home-host-section-header">
            {editingGroup?.id === section.key ? (
              <form className="home-host-group-rename" onSubmit={(event: FormEvent) => {
                event.preventDefault();
                onRenameGroup(section.key, editingGroup.name);
                setEditingGroup(null);
              }}>
                <input autoFocus aria-label={t("entityGroupNameLabel")} value={editingGroup.name} onChange={(event) => setEditingGroup({ ...editingGroup, name: event.target.value })} />
                <button type="submit" aria-label={t("common:save")}><Check size={15} /></button>
                <button type="button" aria-label={t("common:cancel")} onClick={() => setEditingGroup(null)}><X size={15} /></button>
              </form>
            ) : <h2 tabIndex={0}>{section.name}</h2>}
            <div className="home-host-section-meta">
              <span>{t("homeDirectoryHostCount", { count: section.hosts.length })}</span>
              {section.key !== "__ungrouped__" ? (
                <div className="home-host-group-actions">
                  <button type="button" aria-label={`${t("common:edit")} ${section.name}`} title={t("common:edit")} onClick={() => setEditingGroup({ id: section.key, name: section.name })}><Pencil size={15} /></button>
                  <button type="button" data-testid={`home-host-delete-group-${section.key}`} aria-label={`${t("entityDeleteGroup")} ${section.name}`} title={t("entityDeleteGroupHint")} onClick={() => onDeleteGroup(section.key)}><Trash2 size={15} /></button>
                </div>
              ) : null}
            </div>
          </header>
          <div className="home-host-card-grid" data-entity-group-id={section.key}>
            {section.hosts.length > 0 ? section.hosts.map((host) => (
              <div className="home-host-card-shell" key={host.id}>
                <button
                  type="button"
                  className="home-host-card"
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
                <div className="home-host-card-actions">
                  <button type="button" data-testid={`home-host-edit-${host.id}`} aria-label={`${t("common:edit")} ${host.name}`} title={t("common:edit")} onClick={() => onEditHost(host)}><Pencil size={15} /></button>
                  <button type="button" data-testid={`home-host-delete-${host.id}`} aria-label={`${t("common:delete")} ${host.name}`} title={t("common:delete")} onClick={() => onDeleteHost(host)}><Trash2 size={15} /></button>
                </div>
              </div>
            )) : (
              <p className="home-host-section-empty">{t("homeDirectoryEmptyGroup")}</p>
            )}
          </div>
        </section>
      ))}
    </main>
  );
}
