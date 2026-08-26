import { FormEvent, useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { ServerOsIcon } from "./ServerOsIcon";
import { SystemInfoIcon } from "./WorkspaceToolIcons";
import type { AuthMethod, SavedConnection, SshConnectRequest } from "../types";
import { useSessionStore } from "../stores/sessionStore";
import { useToastStore } from "../stores/toastStore";
import { switchWorkspacePanel } from "../stores/workspacePanelSwitch";
import { formatAppError } from "../lib/formatAppError";
import { clampSidebarWidth } from "../lib/sidebarLayout";

interface ConnectionPanelProps {
  cols: number;
  rows: number;
  collapsed: boolean;
  expandedWidth: number;
  onExpandedWidthChange: (width: number) => void;
  /** Collapse sidebar after a successful connect (toggle lives in the title bar). */
  onRequestCollapse?: () => void;
  onRegisterNewRemote?: (open: () => void) => void;
}

const defaultRequest: SshConnectRequest = {
  host: "",
  port: 22,
  username: "",
  auth_method: "password",
  password: "",
  private_key_path: "~/.ssh/id_ed25519",
  passphrase: "",
};

type SshFormMode =
  | { kind: "create" }
  | { kind: "edit"; saved: SavedConnection };

function formatSavedConnectionLabel(saved: SavedConnection): string {
  return saved.port === 22 ? saved.host : `${saved.host}:${saved.port}`;
}

export function ConnectionPanel({
  cols,
  rows,
  collapsed,
  expandedWidth,
  onExpandedWidthChange,
  onRequestCollapse,
  onRegisterNewRemote,
}: ConnectionPanelProps) {
  const { t } = useTranslation(["connection", "shell"]);
  const [sshFormMode, setSshFormMode] = useState<SshFormMode | null>(null);
  const [form, setForm] = useState<SshConnectRequest>(defaultRequest);
  const [connectionName, setConnectionName] = useState("");
  const [savedPasswordPrompt, setSavedPasswordPrompt] =
    useState<SavedConnection | null>(null);
  const [savedPassword, setSavedPassword] = useState("");
  const [rememberPassword, setRememberPassword] = useState(true);
  const [rememberSavedPassword, setRememberSavedPassword] = useState(true);

  const {
    savedConnections,
    loadSavedConnections,
    saveConnection,
    updateSavedConnection,
    deleteSavedConnection,
    createSshSession,
    connectSaved,
    statusMessage,
  } = useSessionStore();

  useEffect(() => {
    void loadSavedConnections();
  }, [loadSavedConnections]);

  const openCreateForm = useCallback(() => {
    setSshFormMode({ kind: "create" });
    setForm(defaultRequest);
    setConnectionName("");
    setRememberPassword(false);
  }, []);

  useEffect(() => {
    onRegisterNewRemote?.(openCreateForm);
  }, [onRegisterNewRemote, openCreateForm]);

  const openEditForm = (saved: SavedConnection) => {
    setSshFormMode({ kind: "edit", saved });
    setConnectionName(saved.name);
    setForm({
      host: saved.host,
      port: saved.port,
      username: saved.username,
      auth_method: saved.auth_method,
      password: "",
      private_key_path: saved.private_key_path ?? "~/.ssh/id_ed25519",
      passphrase: "",
    });
    setRememberPassword(saved.has_password);
  };

  const closeSshForm = () => {
    setSshFormMode(null);
    setForm(defaultRequest);
    setConnectionName("");
    setRememberPassword(true);
  };

  const closePasswordPrompt = () => {
    setSavedPasswordPrompt(null);
    setSavedPassword("");
    setRememberSavedPassword(true);
  };

  const updateField = <K extends keyof SshConnectRequest>(
    key: K,
    value: SshConnectRequest[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const autoCollapseAfterConnect = () => {
    if (!collapsed) {
      onRequestCollapse?.();
    }
  };

  /** Left collapses; right AI panel opens so the engineer is ready to chat. */
  const autoOpenAiAfterConnect = () => {
    const { activeTabId, tabs } = useSessionStore.getState();
    if (!activeTabId) return;
    const tab = tabs.find((item) => item.id === activeTabId);
    switchWorkspacePanel("aiEngineer", activeTabId, tab?.server_id ?? undefined);
  };

  const afterSuccessfulConnect = () => {
    autoCollapseAfterConnect();
    autoOpenAiAfterConnect();
  };

  const handleConnect = async (event: FormEvent) => {
    event.preventDefault();
    if (!sshFormMode) return;

    if (sshFormMode.kind === "edit") {
      if (!connectionName.trim()) return;
      try {
        await updateSavedConnection(
          sshFormMode.saved.id,
          connectionName.trim(),
          form,
          rememberPassword,
        );
        useToastStore.getState().pushToast(t("connection:toastBookmarkUpdated"), true);
        closeSshForm();
      } catch (err) {
        useToastStore.getState().pushToast(formatAppError(err), false);
      }
      return;
    }

    try {
      const result = await createSshSession(
        {
          ...form,
          session_title: connectionName.trim() || null,
        },
        cols,
        rows,
      );
      if (result) {
        const bookmarkName = connectionName.trim() || form.host.trim();
        await saveConnection(
          bookmarkName,
          form,
          rememberPassword,
          result.os_id,
          result.os_name,
        );
      }
      closeSshForm();
      afterSuccessfulConnect();
    } catch {
      // Error toast already shown; keep the form open.
    }
  };

  const handleSavedConnect = async (saved: SavedConnection) => {
    if (saved.auth_method === "password" && !saved.has_password) {
      setSavedPasswordPrompt(saved);
      return;
    }
    try {
      await connectSaved(saved.id, null, false, cols, rows);
      afterSuccessfulConnect();
    } catch {
      if (saved.auth_method === "password") {
        setSavedPasswordPrompt(saved);
        setSavedPassword("");
      }
    }
  };

  const submitSavedPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!savedPasswordPrompt) return;
    try {
      await connectSaved(
        savedPasswordPrompt.id,
        savedPassword || null,
        rememberSavedPassword,
        cols,
        rows,
      );
      closePasswordPrompt();
      afterSuccessfulConnect();
    } catch {
      // Error toast already shown; keep the password dialog open.
    }
  };

  const isEditing = sshFormMode?.kind === "edit";
  const editingSaved =
    sshFormMode?.kind === "edit" ? sshFormMode.saved : null;

  const sshFormModal = sshFormMode ? (
    <Modal
      title={isEditing ? t("connection:modalTitleEdit") : t("connection:modalTitleConnect")}
      onClose={closeSshForm}
    >
      <form className="connection-form" onSubmit={(e) => void handleConnect(e)}>
        <label>
          {isEditing ? t("connection:fieldName") : t("connection:fieldNameOptional")}
          <input
            required={isEditing}
            value={connectionName}
            onChange={(e) => setConnectionName(e.target.value)}
            placeholder={t("connection:namePlaceholder")}
            lang="en"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <label>
          {t("connection:fieldHost")}
          <input
            required
            value={form.host}
            onChange={(e) => updateField("host", e.target.value)}
            placeholder={t("connection:hostPlaceholder")}
            autoFocus
            lang="en"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <label>
          {t("connection:fieldPort")}
          <input
            type="number"
            value={form.port}
            onChange={(e) => updateField("port", Number(e.target.value))}
          />
        </label>
        <label>
          {t("connection:fieldUsername")}
          <input
            required
            value={form.username}
            onChange={(e) => updateField("username", e.target.value)}
            placeholder={t("connection:usernamePlaceholder")}
            lang="en"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
          />
        </label>
        <label>
          {t("connection:fieldAuthMethod")}
          <select
            value={form.auth_method}
            onChange={(e) =>
              updateField("auth_method", e.target.value as AuthMethod)
            }
          >
            <option value="password">{t("connection:authPassword")}</option>
            <option value="privatekey">{t("connection:authPrivateKey")}</option>
          </select>
        </label>
        {form.auth_method === "password" ? (
          <>
            <label>
              {t("connection:fieldPassword")}
              <input
                type="password"
                value={form.password ?? ""}
                onChange={(e) => updateField("password", e.target.value)}
                placeholder={
                  editingSaved?.has_password
                    ? t("connection:passwordSavedPlaceholder")
                    : undefined
                }
              />
            </label>
            <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={rememberPassword}
                  onChange={(e) => setRememberPassword(e.target.checked)}
                />
                {t("connection:rememberPassword")}
              </label>
          </>
        ) : (
          <>
            <label>
              {t("connection:fieldPrivateKeyPath")}
              <input
                value={form.private_key_path ?? ""}
                onChange={(e) =>
                  updateField("private_key_path", e.target.value)
                }
                lang="en"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <label>
              {t("connection:fieldPassphrase")}
              <input
                type="password"
                value={form.passphrase ?? ""}
                onChange={(e) => updateField("passphrase", e.target.value)}
              />
            </label>
          </>
        )}
        <div className="form-row">
          <button type="submit">
            {isEditing ? t("connection:submitSave") : t("connection:submitConnect")}
          </button>
          <button type="button" onClick={closeSshForm}>
            {t("common:cancel")}
          </button>
        </div>
      </form>
    </Modal>
  ) : null;

  const passwordModal = savedPasswordPrompt ? (
    <Modal title={t("connection:modalTitlePassword")} onClose={closePasswordPrompt}>
      <form className="connection-form" onSubmit={(e) => void submitSavedPassword(e)}>
        <p className="modal-hint">
          {savedPasswordPrompt.username}@{savedPasswordPrompt.host}
        </p>
        <label>
          {t("connection:fieldPassword")}
          <input
            type="password"
            value={savedPassword}
            onChange={(e) => setSavedPassword(e.target.value)}
            autoFocus
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={rememberSavedPassword}
            onChange={(e) => setRememberSavedPassword(e.target.checked)}
          />
          {t("connection:rememberPassword")}
        </label>
        <div className="form-row">
          <button type="submit">{t("connection:submitConnect")}</button>
          <button type="button" onClick={closePasswordPrompt}>
            {t("common:cancel")}
          </button>
        </div>
      </form>
    </Modal>
  ) : null;

  const savedItem = (saved: SavedConnection) => (
    <div
      key={saved.id}
      className="saved-item saved-item-compact"
      title={`${saved.name} · ${saved.username}@${saved.host}:${saved.port}`}
    >
      <button
        type="button"
        className="saved-item-main"
        onClick={() => void handleSavedConnect(saved)}
      >
        <ServerOsIcon osId={saved.os_id} osName={saved.os_name} size={16} showTitle={false} />
        <span className="saved-item-text saved-item-text-compact">
          <strong>{saved.name}</strong>
          <span className="saved-item-sep" aria-hidden>
            {" "}
            ·{" "}
          </span>
          <span className="saved-item-host">
            {formatSavedConnectionLabel(saved)}
          </span>
        </span>
      </button>
      <div className="saved-item-actions">
        <button
          type="button"
          className="saved-item-action"
          aria-label={t("common:edit")}
          title={t("common:edit")}
          onClick={() => openEditForm(saved)}
        >
          <svg
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            aria-hidden="true"
          >
            <path d="M11.5 2.5 13.5 4.5 5.5 12.5 3 13l.5-2.5 8-8Z" />
          </svg>
        </button>
        <button
          type="button"
          className="saved-item-action saved-item-delete"
          aria-label={t("common:delete")}
          title={t("common:delete")}
          onClick={() => void deleteSavedConnection(saved.id)}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path
              fill="currentColor"
              d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.997a.58.58 0 0 0-.01 0H11Zm1.958 1H3.042l.853 10.66A1 1 0 0 0 4.885 15h6.23a1 1 0 0 0 .99-1.84l.853-10.66Z"
            />
          </svg>
        </button>
      </div>
    </div>
  );

  const startSidebarResize = (event: ReactMouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = expandedWidth;
    document.body.classList.add("sidebar-resizing");

    const onMouseMove = (moveEvent: MouseEvent) => {
      onExpandedWidthChange(
        clampSidebarWidth(startWidth + (moveEvent.clientX - startX)),
      );
    };

    const onMouseUp = () => {
      document.body.classList.remove("sidebar-resizing");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  if (collapsed) {
    return (
      <>
        {sshFormModal}
        {passwordModal}
      </>
    );
  }

  return (
    <>
      <div className="sidebar-shell">
        <aside className="sidebar">
          <div
            className="sidebar-activity-bar"
            role="tablist"
            aria-label={t("shell:sidebarViewsAria")}
          >
            <button
              type="button"
              role="tab"
              className="sidebar-activity-btn active"
              aria-label={t("shell:sidebarViewHosts")}
              title={t("shell:sidebarViewHosts")}
              aria-selected
            >
              <SystemInfoIcon />
            </button>
          </div>
          <section className="saved-list">
            {savedConnections.length === 0 && (
              <p className="empty-state">{t("shell:emptyBookmarks")}</p>
            )}
            {savedConnections.map((saved) => savedItem(saved))}
          </section>

          {statusMessage && <div className="status-bar">{statusMessage}</div>}
        </aside>
        <div
          className="sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("shell:resizeSidebar")}
          onMouseDown={startSidebarResize}
        />
      </div>
      {sshFormModal}
      {passwordModal}
    </>
  );
}
