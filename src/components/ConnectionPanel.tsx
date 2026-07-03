import { FormEvent, useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Modal } from "./Modal";
import { WindowControls } from "./WindowControls";
import { ServerOsIcon } from "./ServerOsIcon";
import type { AuthMethod, SavedConnection, SshConnectRequest } from "../types";
import { useSessionStore } from "../stores/sessionStore";
import { useToastStore } from "../stores/toastStore";
import {
  getHostOsProfile,
  isWindowsHost,
  localShellInfoToProfile,
  localShellBackendLabel,
  type HostOsProfile,
  type LocalShellInfo,
} from "../lib/hostOs";
import { GIT_FOR_WINDOWS_URL } from "../lib/localShellPreference";

interface ConnectionPanelProps {
  cols: number;
  rows: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  macWindowChrome?: boolean;
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

export function ConnectionPanel({
  cols,
  rows,
  collapsed,
  onToggleCollapse,
  macWindowChrome = false,
  onRegisterNewRemote,
}: ConnectionPanelProps) {
  const fallbackLocal = getHostOsProfile();
  const [localShell, setLocalShell] = useState<{
    profile: HostOsProfile;
    title: string;
    backend: LocalShellInfo["backend"];
    git_bash_available: boolean;
  }>({
    profile: fallbackLocal,
    title: isWindowsHost() ? "Git Bash 本地终端" : `${fallbackLocal.osName} 本地终端`,
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
        useToastStore.getState().pushToast("书签已更新", true);
        closeSshForm();
      } catch (err) {
        useToastStore.getState().pushToast(String(err), false);
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
    } catch {
      // Error toast already shown; keep the password dialog open.
    }
  };

  const isEditing = sshFormMode?.kind === "edit";
  const editingSaved =
    sshFormMode?.kind === "edit" ? sshFormMode.saved : null;

  const sshFormModal = sshFormMode ? (
    <Modal
      title={isEditing ? "编辑书签" : "SSH 连接"}
      onClose={closeSshForm}
    >
      <form className="connection-form" onSubmit={(e) => void handleConnect(e)}>
        <label>
          {isEditing ? "名称" : "名称（可选）"}
          <input
            required={isEditing}
            value={connectionName}
            onChange={(e) => setConnectionName(e.target.value)}
            placeholder="生产服务器（留空则用 IP）"
          />
        </label>
        <label>
          主机
          <input
            required
            value={form.host}
            onChange={(e) => updateField("host", e.target.value)}
            placeholder="192.168.1.10"
            autoFocus
          />
        </label>
        <label>
          端口
          <input
            type="number"
            value={form.port}
            onChange={(e) => updateField("port", Number(e.target.value))}
          />
        </label>
        <label>
          用户名
          <input
            required
            value={form.username}
            onChange={(e) => updateField("username", e.target.value)}
            placeholder="root"
          />
        </label>
        <label>
          认证方式
          <select
            value={form.auth_method}
            onChange={(e) =>
              updateField("auth_method", e.target.value as AuthMethod)
            }
          >
            <option value="password">密码</option>
            <option value="privatekey">私钥</option>
          </select>
        </label>
        {form.auth_method === "password" ? (
          <>
            <label>
              密码
              <input
                type="password"
                value={form.password ?? ""}
                onChange={(e) => updateField("password", e.target.value)}
                placeholder={
                  editingSaved?.has_password
                    ? "已保存，留空表示不修改"
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
                记住密码
              </label>
            )}
          </>
        ) : (
          <>
            <label>
              私钥路径
              <input
                value={form.private_key_path ?? ""}
                onChange={(e) =>
                  updateField("private_key_path", e.target.value)
                }
              />
            </label>
            <label>
              私钥口令（可选）
              <input
                type="password"
                value={form.passphrase ?? ""}
                onChange={(e) => updateField("passphrase", e.target.value)}
              />
            </label>
          </>
        )}
        <div className="form-row">
          <button type="submit">{isEditing ? "保存" : "连接"}</button>
          <button type="button" onClick={closeSshForm}>
            取消
          </button>
        </div>
      </form>
    </Modal>
  ) : null;

  const passwordModal = savedPasswordPrompt ? (
    <Modal title="输入密码" onClose={closePasswordPrompt}>
      <form className="connection-form" onSubmit={(e) => void submitSavedPassword(e)}>
        <p className="modal-hint">
          {savedPasswordPrompt.username}@{savedPasswordPrompt.host}
        </p>
        <label>
          密码
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
          记住密码
        </label>
        <div className="form-row">
          <button type="submit">连接</button>
          <button type="button" onClick={closePasswordPrompt}>
            取消
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
        aria-label={expanded ? "收起侧栏" : "展开侧栏"}
        title={expanded ? "收起侧栏" : "展开侧栏"}
      >
        <SidebarChevronIcon expanded={expanded} />
      </button>
    </div>
  );

  const savedItem = (saved: SavedConnection) => (
    <div key={saved.id} className="saved-item">
      <button
        type="button"
        className="saved-item-main"
        onClick={() => void handleSavedConnect(saved)}
      >
        <ServerOsIcon osId={saved.os_id} osName={saved.os_name} size={16} showTitle={false} />
        <span className="saved-item-text">
          <strong>{saved.name}</strong>
          <span>
            {saved.username}@{saved.host}:{saved.port}
          </span>
        </span>
      </button>
      <button
        type="button"
        className="saved-item-action"
        aria-label="编辑"
        title="编辑"
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
        aria-label="删除"
        title="删除"
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
  );

  if (collapsed) {
    return (
      <>
        <aside className="sidebar sidebar-collapsed">
          {macWindowChrome ? (
            <div className="sidebar-macos-chrome">
              <WindowControls layout="macos" />
            </div>
          ) : null}
          {sidebarChromeRow(false)}

          <div className="sidebar-rail-sessions">
            <button
              type="button"
              className="rail-session rail-session-local"
              aria-label="本地终端"
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
      <aside className="sidebar">
        {macWindowChrome ? (
          <div className="sidebar-macos-chrome">
            <WindowControls layout="macos" />
          </div>
        ) : null}

        {sidebarChromeRow(true)}

        {isWindowsHost() && !localShell.git_bash_available ? (
          <p className="local-shell-hint-banner">
            未检测到 Git Bash ·{" "}
            <button
              type="button"
              className="link-button"
              onClick={() => void openUrl(GIT_FOR_WINDOWS_URL)}
            >
              安装 Git for Windows
            </button>
          </p>
        ) : null}

        <section className="saved-list">
          {savedConnections.length === 0 && (
            <p className="empty-state">暂无 SSH 书签</p>
          )}
          {savedConnections.map((saved) => savedItem(saved))}
        </section>

        {statusMessage && <div className="status-bar">{statusMessage}</div>}
      </aside>
      {sshFormModal}
      {passwordModal}
    </>
  );
}
