import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import {
  shortcutAccentColor,
  shortcutPathLabel,
} from "../lib/shortcutPathLabel";
import { TabFolderIcon } from "./SidebarIcons";
import {
  isShortcutVisibleOnTab,
  useDirectoryShortcutStore,
} from "../stores/directoryShortcutStore";
import { useToastStore } from "../stores/toastStore";
import type {
  DirectoryShortcut,
  DirectoryShortcutScope,
  SessionKind,
} from "../types";

interface TabDirectoryShortcutsProps {
  sessionId: string;
  tabKind: SessionKind;
  serverId: string;
  onActivateTab: () => void;
}

const MENU_WIDTH = 248;

function clampMenuLeft(left: number, width: number) {
  return Math.min(Math.max(8, left), window.innerWidth - width - 8);
}

function useAnchoredMenu() {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        anchorRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const openAtPointer = (event: ReactMouseEvent) => {
    setMenuPos({
      top: event.clientY + 6,
      left: clampMenuLeft(event.clientX, MENU_WIDTH),
    });
    setOpen(true);
  };

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) {
      const left = clampMenuLeft(rect.right - MENU_WIDTH, MENU_WIDTH);
      setMenuPos({ top: rect.bottom + 6, left });
    }
    setOpen(true);
  };

  const close = () => setOpen(false);

  const renderMenu = (content: ReactNode, ariaLabel: string) =>
    open
      ? createPortal(
          <div
            ref={menuRef}
            className="tab-shortcut-menu"
            role="dialog"
            aria-label={ariaLabel}
            style={{ top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {content}
          </div>,
          document.body,
        )
      : null;

  return {
    open,
    anchorRef,
    toggle,
    close,
    openAtPointer,
    renderMenu,
  };
}

function useTabShortcuts(tabKind: SessionKind, serverId: string) {
  const allShortcuts = useDirectoryShortcutStore((s) => s.shortcuts);
  return useMemo(
    () =>
      allShortcuts.filter((item) =>
        isShortcutVisibleOnTab(item, tabKind, serverId),
      ),
    [allShortcuts, tabKind, serverId],
  );
}

interface ShortcutFormProps {
  path: string;
  scope: DirectoryShortcutScope;
  submitLabel: string;
  onPathChange: (value: string) => void;
  onScopeChange: (value: DirectoryShortcutScope) => void;
  onSubmit: (event: FormEvent) => void;
}

function ShortcutForm({
  path,
  scope,
  submitLabel,
  onPathChange,
  onScopeChange,
  onSubmit,
}: ShortcutFormProps) {
  return (
    <form className="tab-shortcut-form tab-shortcut-form-only" onSubmit={onSubmit}>
      <label className="tab-shortcut-field">
        <span>目录</span>
        <input
          type="text"
          value={path}
          placeholder="如 ~/projects 或 /var/log"
          onChange={(event) => onPathChange(event.target.value)}
          autoFocus
        />
      </label>
      <label className="tab-shortcut-field">
        <span>适用</span>
        <select
          value={scope}
          onChange={(event) =>
            onScopeChange(event.target.value as DirectoryShortcutScope)
          }
        >
          <option value="server">当前服务器</option>
          <option value="all">全部服务器</option>
        </select>
      </label>
      <button type="submit" className="tab-shortcut-save">
        {submitLabel}
      </button>
    </form>
  );
}

export function TabDirectoryShortcuts({
  sessionId,
  tabKind,
  serverId,
  onActivateTab,
}: TabDirectoryShortcutsProps) {
  const shortcuts = useTabShortcuts(tabKind, serverId);
  const addShortcut = useDirectoryShortcutStore((s) => s.addShortcut);
  const updateShortcut = useDirectoryShortcutStore((s) => s.updateShortcut);
  const removeShortcut = useDirectoryShortcutStore((s) => s.removeShortcut);
  const pushToast = useToastStore((s) => s.pushToast);
  const addMenu = useAnchoredMenu();

  const [path, setPath] = useState("");
  const [scope, setScope] = useState<DirectoryShortcutScope>("server");

  const [editingShortcut, setEditingShortcut] =
    useState<DirectoryShortcut | null>(null);
  const [editPath, setEditPath] = useState("");
  const [editScope, setEditScope] = useState<DirectoryShortcutScope>("server");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editMenu = useAnchoredMenu();

  useEffect(() => {
    if (!editMenu.open && editingShortcut) {
      setEditingShortcut(null);
      setConfirmDelete(false);
    }
  }, [editMenu.open, editingShortcut]);

  const navigateTo = (targetPath: string) => {
    onActivateTab();
    void invoke("enter_directory", {
      request: { session_id: sessionId, path: targetPath },
    }).catch((err) => {
      pushToast(String(err), false);
    });
  };

  const handleAddSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      pushToast("请输入目录路径", false);
      return;
    }
    addShortcut(trimmedPath, scope, serverId);
    setPath("");
    addMenu.close();
    pushToast("已添加快捷目录", true);
  };

  const openEditMenu = (
    event: ReactMouseEvent,
    shortcut: DirectoryShortcut,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setEditingShortcut(shortcut);
    setEditPath(shortcut.path);
    setEditScope(shortcut.scope);
    setConfirmDelete(false);
    editMenu.openAtPointer(event);
  };

  const closeEditMenu = () => {
    editMenu.close();
    setEditingShortcut(null);
    setConfirmDelete(false);
  };

  const handleEditSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!editingShortcut) return;
    const trimmedPath = editPath.trim();
    if (!trimmedPath) {
      pushToast("请输入目录路径", false);
      return;
    }
    updateShortcut(editingShortcut.id, trimmedPath, editScope, serverId);
    closeEditMenu();
    pushToast("已更新快捷目录", true);
  };

  const handleConfirmDelete = () => {
    if (!editingShortcut) return;
    removeShortcut(editingShortcut.id);
    pushToast(`已移除 ${editingShortcut.path}`, true);
    closeEditMenu();
  };

  return (
    <>
      {shortcuts.length > 0 ? (
        <span className="tab-shortcut-icons">
          {shortcuts.map((item) => (
            <button
              key={item.id}
              type="button"
              className="tab-shortcut-folder"
              style={
                {
                  "--shortcut-accent": shortcutAccentColor(item.path),
                } as CSSProperties
              }
              title={`${shortcutPathLabel(item.path)} — ${item.path}`}
              aria-label={`进入 ${item.path}`}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                navigateTo(item.path);
              }}
              onContextMenu={(event) => openEditMenu(event, item)}
            >
              <TabFolderIcon />
            </button>
          ))}
        </span>
      ) : null}

      <span className="tab-shortcut-wrap">
        <button
          ref={addMenu.anchorRef}
          type="button"
          className="tab-shortcut-add"
          title="添加快捷目录"
          aria-label="添加快捷目录"
          aria-expanded={addMenu.open}
          aria-haspopup="dialog"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            addMenu.toggle();
          }}
        >
          +
        </button>
        {addMenu.renderMenu(
          <>
            <div className="tab-shortcut-menu-header">添加快捷目录</div>
            <ShortcutForm
              path={path}
              scope={scope}
              submitLabel="添加"
              onPathChange={setPath}
              onScopeChange={setScope}
              onSubmit={handleAddSubmit}
            />
          </>,
          "添加快捷目录",
        )}
      </span>

      {editMenu.renderMenu(
        editingShortcut ? (
          <>
            <div className="tab-shortcut-menu-header">
              {confirmDelete ? "确认删除" : "编辑快捷目录"}
            </div>
            {confirmDelete ? (
              <div className="tab-shortcut-confirm">
                <p className="tab-shortcut-confirm-text">
                  确定删除快捷目录
                  <code>{editingShortcut.path}</code>？
                </p>
                <div className="tab-shortcut-confirm-actions">
                  <button
                    type="button"
                    className="tab-shortcut-confirm-cancel"
                    onClick={() => setConfirmDelete(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="tab-shortcut-confirm-delete"
                    onClick={handleConfirmDelete}
                  >
                    删除
                  </button>
                </div>
              </div>
            ) : (
              <>
                <ShortcutForm
                  path={editPath}
                  scope={editScope}
                  submitLabel="保存"
                  onPathChange={setEditPath}
                  onScopeChange={setEditScope}
                  onSubmit={handleEditSubmit}
                />
                <button
                  type="button"
                  className="tab-shortcut-delete"
                  onClick={() => setConfirmDelete(true)}
                >
                  删除快捷目录
                </button>
              </>
            )}
          </>
        ) : null,
        "编辑快捷目录",
      )}
    </>
  );
}

/** @deprecated kept for dev HMR compatibility */
export const TabShortcutMenu = TabDirectoryShortcuts;
