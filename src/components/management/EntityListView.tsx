import { ChevronDown, ChevronRight, FolderPlus, GripVertical, Trash2 } from "lucide-react";
import {
  useMemo,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { K8sClusterIcon } from "../k8s/K8sClusterIcon";
import { TerminalIcon } from "../WorkspaceToolIcons";
import { isDefaultGroupId, type EntityLayoutScope } from "../../lib/entityListLayout";
import {
  startEntityPointerReorder,
  type EntityDropTarget,
} from "../../lib/entityPointerReorder";
import {
  selectEntitySections,
  useEntityLayoutStore,
} from "../../stores/entityLayoutStore";

type Props = {
  scope: EntityLayoutScope;
  entityIds: string[];
  renderItem: (id: string) => ReactNode;
  onAddEntity?: () => void;
  onOrderChange?: (orderedIds: string[]) => void;
  className?: string;
};

export function EntityListView({
  scope,
  entityIds,
  renderItem,
  onAddEntity,
  onOrderChange,
  className,
}: Props) {
  const { t } = useTranslation(["shell", "k8s"]);
  const listRef = useRef<HTMLDivElement>(null);
  const layout = useEntityLayoutStore((s) => s.layouts[scope]);
  const ensureScope = useEntityLayoutStore((s) => s.ensureScope);
  const addGroup = useEntityLayoutStore((s) => s.addGroup);
  const handleItemDrop = useEntityLayoutStore((s) => s.handleItemDrop);
  const handleGroupDrop = useEntityLayoutStore((s) => s.handleGroupDrop);
  const renameGroup = useEntityLayoutStore((s) => s.renameGroup);
  const deleteGroup = useEntityLayoutStore((s) => s.deleteGroup);
  const toggleGroupCollapsed = useEntityLayoutStore((s) => s.toggleGroupCollapsed);

  const defaultGroupName = t("shell:entityUngrouped");
  const addEntityLabel =
    scope === "k8s" ? t("k8s:addClusterTitle") : t("shell:newSsh");
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const entityIdKey = useMemo(() => entityIds.join("\0"), [entityIds]);

  useEffect(() => {
    ensureScope(scope, entityIds);
  }, [ensureScope, scope, entityIdKey, entityIds]);

  const sections = useMemo(
    () => selectEntitySections(layout, entityIds, defaultGroupName),
    [layout, entityIdKey, entityIds, defaultGroupName],
  );

  const onAddGroup = () => {
    addGroup(scope, entityIds, t("shell:entityGroupDefaultName"));
  };

  const onItemDrop = (dragId: string, target: EntityDropTarget) => {
    handleItemDrop(scope, entityIds, dragId, target, onOrderChange, defaultGroupName);
  };

  const onGroupDrop = (dragGroupId: string, target: EntityDropTarget) => {
    handleGroupDrop(scope, entityIds, dragGroupId, target);
  };

  const onDeleteGroup = (groupId: string) => {
    deleteGroup(
      scope,
      entityIds,
      groupId,
      onOrderChange,
      defaultGroupName,
    );
  };

  const startItemDrag = (
    event: ReactMouseEvent,
    itemId: string,
    rowElement: HTMLElement,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const listRoot = listRef.current;
    if (!listRoot) return;
    startEntityPointerReorder({
      dragId: itemId,
      dragKind: "item",
      rowElement,
      listRoot,
      startX: event.clientX,
      startY: event.clientY,
      onDrop: (target) => onItemDrop(itemId, target),
      onPreview: () => {},
    });
  };

  const startGroupDrag = (
    event: ReactMouseEvent,
    groupId: string,
    rowElement: HTMLElement,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const listRoot = listRef.current;
    if (!listRoot) return;
    startEntityPointerReorder({
      dragId: groupId,
      dragKind: "group",
      rowElement,
      listRoot,
      startX: event.clientX,
      startY: event.clientY,
      onDrop: (target) => onGroupDrop(groupId, target),
      onPreview: () => {},
    });
  };

  const commitRename = (groupId: string) => {
    renameGroup(scope, entityIds, groupId, renameDraft);
    setRenamingGroupId(null);
    setRenameDraft("");
  };

  return (
    <div className={`entity-list-view${className ? ` ${className}` : ""}`}>
      <div className="entity-list-toolbar">
        {onAddEntity ? (
          <button
            type="button"
            className="entity-list-icon-btn entity-list-icon-btn--add"
            data-testid={`entity-add-item-${scope}`}
            onClick={onAddEntity}
            title={addEntityLabel}
            aria-label={addEntityLabel}
          >
            {scope === "k8s" ? (
              <K8sClusterIcon size={16} />
            ) : (
              <TerminalIcon />
            )}
            <span className="entity-add-badge" aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          className="entity-list-icon-btn"
          data-testid={`entity-add-group-${scope}`}
          onClick={onAddGroup}
          title={t("shell:entityAddGroup")}
          aria-label={t("shell:entityAddGroup")}
        >
          <FolderPlus size={16} aria-hidden />
        </button>
      </div>
      <div className="entity-list-sections" ref={listRef}>
        {sections.map((section) => {
          const group = section.group;
          const isDefault = section.defaultGroup || isDefaultGroupId(group.id);
          return (
            <div key={section.key} className="entity-list-section" data-entity-section-id={group.id}>
              <div
                className={`entity-group-header${isDefault ? " entity-group-header--default" : ""}`}
                data-entity-group-id={group.id}
                data-testid={`entity-group-${group.id}`}
              >
                <button
                  type="button"
                  className="entity-group-collapse"
                  aria-expanded={!group.collapsed}
                  onClick={() =>
                    toggleGroupCollapsed(scope, entityIds, group.id)
                  }
                >
                  {group.collapsed ? (
                    <ChevronRight size={14} aria-hidden />
                  ) : (
                    <ChevronDown size={14} aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  className="entity-drag-handle entity-drag-handle--group"
                  aria-label={t("shell:entityDragGroup")}
                  onMouseDown={(event) => {
                    const header = (event.currentTarget as HTMLElement).closest(
                      ".entity-group-header",
                    );
                    if (header) {
                      startGroupDrag(event, group.id, header as HTMLElement);
                    }
                  }}
                >
                  <GripVertical size={14} aria-hidden />
                </button>
                {renamingGroupId === group.id && !isDefault ? (
                  <input
                    className="entity-group-rename-input"
                    value={renameDraft}
                    autoFocus
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => commitRename(group.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(group.id);
                      if (e.key === "Escape") setRenamingGroupId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="entity-group-title"
                    disabled={isDefault}
                    onDoubleClick={() => {
                      if (isDefault) return;
                      setRenamingGroupId(group.id);
                      setRenameDraft(group.name);
                    }}
                  >
                    {group.name}
                  </button>
                )}
                {!isDefault ? (
                  <button
                    type="button"
                    className="entity-group-delete"
                    aria-label={t("shell:entityDeleteGroupHint")}
                    title={t("shell:entityDeleteGroupHint")}
                    onClick={() => onDeleteGroup(group.id)}
                  >
                    <Trash2 size={12} aria-hidden />
                  </button>
                ) : null}
              </div>
              {!group.collapsed ? (
                <div className="entity-list-items">
                  {section.itemIds.map((id) => (
                    <div
                      key={id}
                      className="entity-list-item-wrap"
                      data-entity-item-id={id}
                    >
                      <button
                        type="button"
                        className="entity-drag-handle entity-drag-handle--item"
                        aria-label={t("shell:entityDragItem")}
                        data-testid={`entity-drag-${id}`}
                        onMouseDown={(event) => {
                          const wrap = (event.currentTarget as HTMLElement).closest(
                            ".entity-list-item-wrap",
                          );
                          if (wrap) startItemDrag(event, id, wrap as HTMLElement);
                        }}
                      >
                        <GripVertical size={14} aria-hidden />
                      </button>
                      {renderItem(id)}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
