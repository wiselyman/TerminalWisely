import { FormEvent, useEffect, useState } from "react";
import { Modal } from "./Modal";
import { LocalTerminalIcon, SshConnectIcon } from "./SidebarIcons";
import type { AuthMethod, SavedConnection, SshConnectRequest } from "../types";
import { useSessionStore } from "../stores/sessionStore";

interface ConnectionPanelProps {
  cols: number;
  rows: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
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
}: ConnectionPanelProps) {
  const [showForm, setShowForm] = useState(false);
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
    deleteSavedConnection,
    createLocalSession,
    createSshSession,
    connectSaved,
    statusMessage,
  } = useSessionStore();

  useEffect(() => {
    void loadSavedConnections();
  }, [loadSavedConnections]);

  const closeSshForm = () => {
    setShowForm(false);
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
    try {
      await createSshSession(
        {
          ...form,
          session_title: connectionName.trim() || null,
        },
        cols,
        rows,
      );
      if (connectionName.trim()) {
        await saveConnection(connectionName.trim(), form, rememberPassword);
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

  const sshFormModal = showForm ? (
    <Modal title="SSH 连接" onClose={closeSshForm}>
      <form className="connection-form" onSubmit={(e) => void handleConnect(e)}>
        <label>
          名称（可选）
          <input
            value={connectionName}
            onChange={(e) => setConnectionName(e.target.value)}
            placeholder="生产服务器"
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
              />
            </label>
            {connectionName.trim() && (
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
          <button type="submit">连接</button>
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

  const savedItem = (saved: SavedConnection) => (
    <div key={saved.id} className="saved-item">
      <button
        type="button"
        className="saved-item-main"
        onClick={() => void handleSavedConnect(saved)}
      >
        <strong>{saved.name}</strong>
        <span>
          {saved.username}@{saved.host}:{saved.port}
        </span>
      </button>
      <button
        type="button"
        className="saved-item-delete"
        aria-label="删除"
        title="删除"
        onClick={() => void deleteSavedConnection(saved.id)}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
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
          <div className="sidebar-top-row sidebar-top-row-collapsed">
            <button
              type="button"
              className="sidebar-toggle"
              onClick={onToggleCollapse}
              aria-label="展开侧栏"
            title="展开侧栏"
          >
            <SidebarChevronIcon expanded={false} />
          </button>
          </div>

          <div className="sidebar-rail-actions">
            <button
              type="button"
              className="sidebar-action-btn local"
              aria-label="Local 本地终端"
              title="Local 本地终端"
              onClick={() => void createLocalSession(cols, rows)}
            >
              <LocalTerminalIcon />
            </button>
            <button
              type="button"
              className="sidebar-action-btn ssh"
              aria-label="Remote 远程 SSH"
              title="Remote 远程 SSH"
              onClick={() => setShowForm(true)}
            >
              <SshConnectIcon />
            </button>
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
        <div className="sidebar-top-row">
          <button
            type="button"
            className="sidebar-action-btn local"
            aria-label="Local 本地终端"
            title="Local 本地终端"
            onClick={() => void createLocalSession(cols, rows)}
          >
            <LocalTerminalIcon />
          </button>
          <button
            type="button"
            className="sidebar-action-btn ssh"
            aria-label="Remote 远程 SSH"
            title="Remote 远程 SSH"
            onClick={() => setShowForm(true)}
          >
            <SshConnectIcon />
          </button>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={onToggleCollapse}
            aria-label="收起侧栏"
            title="收起侧栏"
          >
            <SidebarChevronIcon expanded={true} />
          </button>
        </div>

        <section className="saved-list">
          <div className="section-heading">
            <h2>书签</h2>
            <span className="section-count">{savedConnections.length}</span>
          </div>
          {savedConnections.length === 0 && (
            <p className="empty-state">暂无书签</p>
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
