import { FormEvent, useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Modal } from "./Modal";
import { ServerOsIcon } from "./ServerOsIcon";
import type { AuthMethod, SavedConnection, SshConnectRequest } from "../types";
import { useSessionStore } from "../stores/sessionStore";
import { useToastStore } from "../stores/toastStore";
import { formatAppError } from "../lib/formatAppError";
import {
  getHostOsProfile,
  isWindowsHost,
  localShellInfoToProfile,
  localShellBackendLabel,
  type HostOsProfile,
  type LocalShellInfo,
} from "../lib/hostOs";
import { GIT_FOR_WINDOWS_URL } from "../lib/localShellPreference";
import { clampSidebarWidth } from "../lib/sidebarLayout";

interface ConnectionPanelProps {
  cols: number;
  rows: number;
  collapsed: boolean;
  expandedWidth: number;
  onExpandedWidthChange: (width: number) => void;
  onToggleCollapse: () => void;
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

function SidebarChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {expanded ? (
        <>
          <path d="M10 4 6 8l4 4" />
          <path d="M6 4 2 8l4 4" />
        </>
      ) : (
        <>
          <path d="M6 4l4 4-4 4" />
          <path d="M10 4l4 4-4 4" />
        </>
      )}
    </svg>
  );
}

function formatSavedConnectionLabel(saved: SavedConnection): string {
  return saved.port === 22 ? saved.host : `${saved.host}:${saved.port}`;
}

export function ConnectionPanel({
  cols,
  rows,
  collapsed,
  expandedWidth,
  onExpandedWidthChange,
  onToggleCollapse,
  onRegisterNewRemote,
}: ConnectionPanelProps) {
  const { t } = useTranslation(["connection", "shell"]);
  const fallbackLocal = getHostOsProfile();
  const [localShell, setLocalShell] = useState<{
    profile: HostOsProfile;
    title: string;
    backend: LocalShellInfo["backend"];
    git_bash_available: boolean;
  }>({
    profile: fallbackLocal,
    title: isWindowsHost()
      ? t("shell:gitBashLocal")
      : t("shell:localTerminalTitle", { osName: fallbackLocal.osName }),
    backend: "git_bash",
    git_bash_available: false,
  });
  const [sshFormMode, setSshFormMode] = useState<SshFormMode | null>(null);
  const [form, setForm] = useState<SshConnectRequest>(defaultRequest);
  const [connectionName, setConnectionName] = useState("");
  const [savedPasswordPrompt, setSavedPasswordPrompt] =
    useState<SavedConnection | null>(null);
  const [savedPassword, setSavedPassword] = useState("");
  const [rememberPassword, setRememberPassword] = useState(false);
  const [rememberSavedPassword, setRememberSavedPassword] = useState(false);

  const {
    savedConnections,
    loadSavedConnections,
    saveConnection,
    updateSavedConnection,
    deleteSavedConnection,
    createLocalSession,
    createSshSession,
    connectSaved,
    statusMessage,
  } = useSessionStore();

  useEffect(() => {
    void loadSavedConnections();
  }, [loadSavedConnections]);

  const refreshLocalShell = useCallback(() => {
    void invoke<LocalShellInfo>("get_local_shell_info")
      .then((info) => {
        setLocalShell({
          profile: localShellInfoToProfile(info),
          title: info.title,
          backend: info.backend,
          git_bash_available: info.git_bash_available,
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshLocalShell();
  }, [refreshLocalShell]);

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
    setRememberPassword(false);
  };

  const closePasswordPrompt = () => {
    setSavedPasswordPrompt(null);
    setSavedPassword("");
    setRememberSavedPassword(false);
  };

  const updateField = <K extends keyof SshConnectRequest>(
    key: K,
    value: SshConnectRequest[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const autoCollapseAfterConnect = () => {
    if (!collapsed) {
      onToggleCollapse();
    }
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
      autoCollapseAfterConnect();
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
      autoCollapseAfterConnect();
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
      autoCollapseAfterConnect();
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
            {(isEditing || connectionName.trim()) && (
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={rememberPassword}
                  onChange={(e) => setRememberPassword(e.target.checked)}
                />
                {t("connection:rememberPassword")}
              </label>
            )}
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

  const localTerminalTitle = !isWindowsHost()
    ? `${localShell.title} · ${localShellBackendLabel(localShell.backend)}`
    : localShell.title;

  const sidebarChromeRow = (expanded: boolean) => (
    <div
      className={`sidebar-chrome-row${expanded ? "" : " sidebar-chrome-row-collapsed"}`}
    >
      {expanded ? (
        <button
          type="button"
          className="sidebar-local-btn sidebar-local-btn-icon"
          onClick={() => void createLocalSession(cols, rows)}
          aria-label={localTerminalTitle}
          title={localTerminalTitle}
        >
          <ServerOsIcon
            osId={localShell.profile.osId}
            osName={localShell.profile.osName}
            size={18}
            showTitle={false}
          />
        </button>
      ) : null}
      <button
        type="button"
        className="sidebar-toggle"
        onClick={onToggleCollapse}
        aria-label={expanded ? t("shell:collapseSidebar") : t("shell:expandSidebar")}
        title={expanded ? t("shell:collapseSidebar") : t("shell:expandSidebar")}
      >
        <SidebarChevronIcon expanded={expanded} />
      </button>
    </div>
  );

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
        <aside className="sidebar sidebar-collapsed">
          {sidebarChromeRow(false)}

          <div className="sidebar-rail-sessions">
            <button
              type="button"
              className="rail-session rail-session-local"
              aria-label={t("common:localTerminal")}
              title={localShell.title}
              onClick={() => void createLocalSession(cols, rows)}
            >
              <ServerOsIcon
                osId={localShell.profile.osId}
                osName={localShell.profile.osName}
                size={18}
                showTitle={false}
              />
            </button>
            {savedConnections.map((saved) => (
              <button
                key={saved.id}
                type="button"
                className="rail-session"
                aria-label={saved.name}
                title={saved.name}
                onClick={() => void handleSavedConnect(saved)}
              >
                <ServerOsIcon
                  osId={saved.os_id}
                  osName={saved.os_name}
                  size={18}
                  showTitle={false}
                />
              </button>
            ))}
          </div>
        </aside>
        {sshFormModal}
        {passwordModal}
      </>
    );
  }

  return (
    <>
      <div className="sidebar-shell">
        <aside className="sidebar">
          {sidebarChromeRow(true)}

          {isWindowsHost() && !localShell.git_bash_available ? (
            <p className="local-shell-hint-banner">
              {t("shell:gitBashMissingBanner")}{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => void openUrl(GIT_FOR_WINDOWS_URL)}
              >
                {t("shell:installGitForWindows")}
              </button>
            </p>
          ) : null}

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
