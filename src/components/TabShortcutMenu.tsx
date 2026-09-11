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
import { useTranslation } from "react-i18next";
import {
  isSyntheticTerminalMouseEvent,
  armChromeClickSuppress,
} from "../lib/terminalSelectionDrag";
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
import { formatAppError } from "../lib/formatAppError";
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
  const openedAtRef = useRef(0);

  useEffect(() => {
    if (!open) return;

    openedAtRef.current = performance.now();

    const onDismiss = (event: MouseEvent) => {
      if (isSyntheticTerminalMouseEvent(event)) return;
      if (event.button !== 0) return;
      if (performance.now() - openedAtRef.current < 500) return;
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

    let disposed = false;
    const timer = window.setTimeout(() => {
      if (disposed) return;
      document.addEventListener("click", onDismiss, true);
      document.addEventListener("keydown", onKeyDown);
    }, 0);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      document.removeEventListener("click", onDismiss, true);
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
  const { t } = useTranslation("shell");
  return (
    <form className="tab-shortcut-form tab-shortcut-form-only" onSubmit={onSubmit}>
      <label className="tab-shortcut-field">
        <span>{t("shortcutPathLabel")}</span>
        <input
          type="text"
          value={path}
          placeholder={t("shortcutPathPlaceholder")}
          onChange={(event) => onPathChange(event.target.value)}
          autoFocus
        />
      </label>
      <label className="tab-shortcut-field">
        <span>{t("shortcutScopeLabel")}</span>
        <select
          value={scope}
          onChange={(event) =>
            onScopeChange(event.target.value as DirectoryShortcutScope)
          }
        >
          <option value="server">{t("shortcutScopeServer")}</option>
          <option value="all">{t("shortcutScopeAll")}</option>
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
  const { t } = useTranslation(["shell", "common"]);
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
      pushToast(formatAppError(err), false);
    });
  };

  const handleAddSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      pushToast(t("toastNeedPath", { ns: "shell" }), false);
      return;
    }
    addShortcut(trimmedPath, scope, serverId);
    setPath("");
    addMenu.close();
    pushToast(t("toastShortcutAdded", { ns: "shell" }), true);
  };

  const openEditMenu = (
    event: ReactMouseEvent,
    shortcut: DirectoryShortcut,
  ) => {
    event.preventDefault();
    armChromeClickSuppress(1000);
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
      pushToast(t("toastNeedPath", { ns: "shell" }), false);
      return;
    }
    updateShortcut(editingShortcut.id, trimmedPath, editScope, serverId);
    closeEditMenu();
    pushToast(t("toastShortcutUpdated", { ns: "shell" }), true);
  };

  const handleConfirmDelete = () => {
    if (!editingShortcut) return;
    removeShortcut(editingShortcut.id);
    pushToast(
      t("toastShortcutRemoved", { ns: "shell", path: editingShortcut.path }),
      true,
    );
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
              aria-label={t("enterShortcutAria", { ns: "shell", path: item.path })}
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
          title={t("addShortcut", { ns: "shell" })}
          aria-label={t("addShortcut", { ns: "shell" })}
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
            <div className="tab-shortcut-menu-header">
              {t("addShortcut", { ns: "shell" })}
            </div>
            <ShortcutForm
              path={path}
              scope={scope}
              submitLabel={t("add", { ns: "common" })}
              onPathChange={setPath}
              onScopeChange={setScope}
              onSubmit={handleAddSubmit}
            />
          </>,
          t("addShortcut", { ns: "shell" }),
        )}
      </span>

      {editMenu.renderMenu(
        editingShortcut ? (
          <>
            <div className="tab-shortcut-menu-header">
              {confirmDelete
                ? t("confirmDeleteShortcut", { ns: "shell" })
                : t("editShortcut", { ns: "shell" })}
            </div>
            {confirmDelete ? (
              <div className="tab-shortcut-confirm">
                <p className="tab-shortcut-confirm-text">
                  {t("deleteShortcutConfirm", {
                    ns: "shell",
                    path: editingShortcut.path,
                  })}
                </p>
                <div className="tab-shortcut-confirm-actions">
                  <button
                    type="button"
                    className="tab-shortcut-confirm-cancel"
                    onClick={() => setConfirmDelete(false)}
                  >
                    {t("cancel", { ns: "common" })}
                  </button>
                  <button
                    type="button"
                    className="tab-shortcut-confirm-delete"
                    onClick={handleConfirmDelete}
                  >
                    {t("delete", { ns: "common" })}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <ShortcutForm
                  path={editPath}
                  scope={editScope}
                  submitLabel={t("save", { ns: "common" })}
                  onPathChange={setEditPath}
                  onScopeChange={setEditScope}
                  onSubmit={handleEditSubmit}
                />
                <button
                  type="button"
                  className="tab-shortcut-delete"
                  onClick={() => setConfirmDelete(true)}
                >
                  {t("deleteShortcutAction", { ns: "shell" })}
                </button>
              </>
            )}
          </>
        ) : null,
        t("editShortcut", { ns: "shell" }),
      )}
    </>
  );
}

/** @deprecated kept for dev HMR compatibility */
export const TabShortcutMenu = TabDirectoryShortcuts;
