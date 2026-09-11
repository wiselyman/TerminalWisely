import { Check, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { ServerOsIcon } from "./ServerOsIcon";
import { K8sClusterIcon } from "./k8s/K8sClusterIcon";
import { HelmBrandIcon } from "./k8s/HelmBrandIcon";
import { EditK8sClusterModal } from "./k8s/EditK8sClusterModal";
import { EntityCatalog } from "./management/EntityCatalog";
import { EntityListView } from "./management/EntityListView";
import { EntityRow } from "./management/EntityRow";
import type { AuthMethod, SavedConnection, SshConnectRequest } from "../types";
import type { K8sClusterTarget } from "../lib/k8s/types";
import type { K8sToolInfo, SshKubectlProbe } from "../lib/k8s/api";
import { k8sProbeSshKubectl } from "../lib/k8s/api";
import { useSessionStore } from "../stores/sessionStore";
import { useToastStore } from "../stores/toastStore";
import { useSidebarViewStore } from "../stores/sidebarViewStore";
import { useK8sStore } from "../stores/k8sStore";
import { focusManagedEntity } from "../stores/managedEntityStore";
import { switchWorkspacePanel } from "../stores/workspacePanelSwitch";
import { formatAppError } from "../lib/formatAppError";
import { clampSidebarWidth } from "../lib/sidebarLayout";
import {
  findSshKubectlClusterForServer,
  findSshTabForSaved,
  savedServerKey,
  sshKubectlProbeOk,
} from "../lib/k8s/sshHostBind";
import { useAppUpdateStore } from "../stores/appUpdateStore";
import { UpdateAvailableBadge } from "./UpdateAvailableBadge";

interface ConnectionPanelProps {
  cols: number;
  rows: number;
  collapsed: boolean;
  expandedWidth: number;
  onExpandedWidthChange: (width: number) => void;
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

function toolStatus(info: K8sToolInfo | null | undefined): "missing" | "ok" | "update" {
  if (!info?.installed) return "missing";
  if (info.update_available) return "update";
  return "ok";
}

function ToolStatusBadge({
  info,
}: {
  info: K8sToolInfo | null | undefined;
}) {
  const status = toolStatus(info);
  if (status === "missing") {
    return (
      <span className="k8s-tool-badge k8s-tool-badge--missing" aria-hidden>
        <X size={8} strokeWidth={3} />
      </span>
    );
  }
  if (status === "update") {
    return <span className="k8s-tool-badge k8s-tool-badge--update" aria-hidden />;
  }
  return (
    <span className="k8s-tool-badge k8s-tool-badge--ok" aria-hidden>
      <Check size={8} strokeWidth={3} />
    </span>
  );
}

function toolTitle(
  info: K8sToolInfo | null | undefined,
  name: string,
  t: (key: string, opts?: Record<string, string>) => string,
): string {
  if (!info?.installed) return t("k8s:toolsClickInstall", { name });
  if (info.update_available) {
    return t("k8s:toolsClickUpdate", {
      name,
      current: info.version ?? "?",
      latest: info.latest_version ?? "?",
    });
  }
  return t("k8s:toolsAlreadyInstalled", {
    name,
    version: info.version ? ` ${info.version}` : "",
  });
}

export function ConnectionPanel({
  cols,
  rows,
  collapsed,
  expandedWidth,
  onExpandedWidthChange,
  onRegisterNewRemote,
}: ConnectionPanelProps) {
  const { t } = useTranslation(["connection", "shell", "k8s"]);
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
    reorderSavedConnections,
    createSshSession,
    connectSaved,
    statusMessage,
  } = useSessionStore();
  const hasPendingUpdate = useAppUpdateStore((s) => s.pending != null);
  const sidebarView = useSidebarViewStore((s) => s.view);
  const setSidebarView = useSidebarViewStore((s) => s.setView);
  const clusters = useK8sStore((s) => s.clusters);
  const selectedClusterId = useK8sStore((s) => s.selectedClusterId);
  const refreshClusters = useK8sStore((s) => s.refreshClusters);
  const selectCluster = useK8sStore((s) => s.selectCluster);
  const removeSshBinding = useK8sStore((s) => s.removeSshBinding);
  const removeImportedKubeconfig = useK8sStore((s) => s.removeImportedKubeconfig);
  const toolsStatus = useK8sStore((s) => s.toolsStatus);
  const toolsBusy = useK8sStore((s) => s.toolsBusy);
  const installTools = useK8sStore((s) => s.installTools);
  const refreshToolsStatus = useK8sStore((s) => s.refreshToolsStatus);
  const k8sLoading = useK8sStore((s) => s.loading);
  const setAddClusterOpen = useK8sStore((s) => s.setAddClusterOpen);
  const pushToast = useToastStore((s) => s.pushToast);
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const sshTabs = useMemo(
    () => tabs.filter((tab) => tab.kind === "ssh"),
    [tabs],
  );
  const [bindBusyId, setBindBusyId] = useState<string | null>(null);
  const [probeBySession, setProbeBySession] = useState<
    Record<string, SshKubectlProbe | "loading">
  >({});
  const probeOkRef = useRef<Record<string, boolean>>({});
  const [k8sFlashSessionIds, setK8sFlashSessionIds] = useState<Set<string>>(
    () => new Set(),
  );

  const markK8sDetected = useCallback((sessionId: string) => {
    if (probeOkRef.current[sessionId]) return;
    probeOkRef.current[sessionId] = true;
    setK8sFlashSessionIds((prev) => new Set(prev).add(sessionId));
    window.setTimeout(() => {
      setK8sFlashSessionIds((prev) => {
        if (!prev.has(sessionId)) return prev;
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }, 2600);
  }, []);

  useEffect(() => {
    if (sshTabs.length === 0) {
      setProbeBySession({});
      probeOkRef.current = {};
      setK8sFlashSessionIds(new Set());
      return;
    }
    let cancelled = false;
    const sessionIds = new Set(sshTabs.map((tab) => tab.id));
    for (const id of Object.keys(probeOkRef.current)) {
      if (!sessionIds.has(id)) {
        delete probeOkRef.current[id];
      }
    }
    setProbeBySession((prev) => {
      const next: Record<string, SshKubectlProbe | "loading"> = {};
      for (const id of sessionIds) {
        next[id] = prev[id] === "loading" || prev[id] == null ? "loading" : prev[id];
      }
      for (const id of sessionIds) {
        if (next[id] !== "loading" && next[id] != null) continue;
        next[id] = "loading";
      }
      return next;
    });
    void (async () => {
      for (const tab of sshTabs) {
        try {
          const result = await k8sProbeSshKubectl(tab.id);
          if (cancelled) return;
          setProbeBySession((prev) => ({ ...prev, [tab.id]: result }));
          if (result.ok) {
            markK8sDetected(tab.id);
          } else {
            probeOkRef.current[tab.id] = false;
          }
        } catch (err) {
          if (cancelled) return;
          setProbeBySession((prev) => ({
            ...prev,
            [tab.id]: {
              ok: false,
              error: formatAppError(err) || "probe failed",
            },
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sshTabs, markK8sDetected]);

  const bindSshCluster = useK8sStore((s) => s.bindSshCluster);

  const savedById = useMemo(
    () => new Map(savedConnections.map((item) => [item.id, item])),
    [savedConnections],
  );
  const hostEntityIds = useMemo(
    () => savedConnections.map((item) => item.id),
    [savedConnections],
  );
  const clusterById = useMemo(
    () => new Map(clusters.map((item) => [item.id, item])),
    [clusters],
  );
  const k8sEntityIds = useMemo(
    () => clusters.map((item) => item.id),
    [clusters],
  );
  const [editCluster, setEditCluster] = useState<K8sClusterTarget | null>(null);

  useEffect(() => {
    void loadSavedConnections();
  }, [loadSavedConnections]);

  useEffect(() => {
    if (sidebarView === "k8s") {
      void refreshClusters();
      void refreshToolsStatus();
    }
  }, [sidebarView, refreshClusters, refreshToolsStatus]);

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

  const autoOpenAiAfterConnect = () => {
    const { activeTabId, tabs } = useSessionStore.getState();
    if (!activeTabId) return;
    const tab = tabs.find((item) => item.id === activeTabId);
    focusManagedEntity({
      kind: "server",
      id: tab?.server_id || activeTabId,
      label: tab?.title || activeTabId,
      sessionId: activeTabId,
      serverId: tab?.server_id,
    });
    switchWorkspacePanel("aiEngineer", activeTabId, tab?.server_id ?? undefined);
  };

  const afterSuccessfulConnect = () => {
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
    // Each host click opens a new SSH tab: bare name, then (1), (2), …
    if (saved.auth_method === "password" && !saved.has_password) {
      setSavedPasswordPrompt(saved);
      return;
    }
    const sessionId = await connectSaved(saved.id, null, false, cols, rows);
    if (sessionId) {
      afterSuccessfulConnect();
      return;
    }
    if (saved.auth_method === "password") {
      setSavedPasswordPrompt(saved);
      setSavedPassword("");
    }
  };

  const submitSavedPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!savedPasswordPrompt) return;
    const sessionId = await connectSaved(
      savedPasswordPrompt.id,
      savedPassword || null,
      rememberSavedPassword,
      cols,
      rows,
    );
    if (sessionId) {
      closePasswordPrompt();
      afterSuccessfulConnect();
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

  const savedItem = (saved: SavedConnection) => {
    const activeTab = tabs.find((item) => item.id === activeTabId);
    const serverKey = savedServerKey(saved);
    const selected =
      Boolean(activeTab?.server_id) && activeTab?.server_id === serverKey;
    const sshTab = findSshTabForSaved(sshTabs, serverKey, activeTabId);
    const probe = sshTab ? probeBySession[sshTab.id] : undefined;
    const showAddK8s = sshTab != null && sshKubectlProbeOk(probe);
    const probeVersion =
      probe && probe !== "loading" && probe.ok ? probe.version : null;

    const onAddToK8s = () => {
      if (!sshTab) return;
      const existing = findSshKubectlClusterForServer(clusters, serverKey);
      if (existing) {
        selectCluster(existing.id);
        setSidebarView("k8s");
        return;
      }
      setBindBusyId(sshTab.id);
      void bindSshCluster({
        display_name: saved.name,
        session_id: sshTab.id,
        server_id: serverKey,
      })
        .then((target) => {
          pushToast(t("k8s:bindOk"), true);
          selectCluster(target.id);
          setSidebarView("k8s");
        })
        .catch((err) =>
          pushToast(formatAppError(err) || t("k8s:bindFailed"), false),
        )
        .finally(() => setBindBusyId(null));
    };

    return (
      <EntityRow
        embedded
        selected={selected}
        title={`${saved.name} · ${saved.username}@${saved.host}:${saved.port}`}
        icon={
          <ServerOsIcon
            osId={saved.os_id}
            osName={saved.os_name}
            size={16}
            showTitle={false}
          />
        }
        primary={saved.name}
        onActivate={() => {
          focusManagedEntity({
            kind: "server",
            id: serverKey,
            label: saved.name,
            serverId: serverKey,
          });
          void handleSavedConnect(saved);
        }}
        actions={
          <>
            {showAddK8s ? (
              <button
                type="button"
                className={[
                  "saved-item-action",
                  "saved-item-action--k8s",
                  k8sFlashSessionIds.has(sshTab.id)
                    ? "saved-item-action--k8s-detected"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-testid="k8s-host-add-cluster"
                disabled={bindBusyId === sshTab.id}
                aria-label={t("k8s:hostAddToK8s")}
                title={t("k8s:hostAddToK8sHint", {
                  version: probeVersion ? ` (${probeVersion})` : "",
                })}
                onClick={(event) => {
                  event.stopPropagation();
                  onAddToK8s();
                }}
              >
                <K8sClusterIcon size={12} />
              </button>
            ) : null}
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
          </>
        }
      />
    );
  };

  const clusterItem = (cluster: K8sClusterTarget) => {
    const canEdit =
      cluster.kind === "kubeconfig" && Boolean(cluster.kubeconfig_path);
    const canRemove =
      cluster.kind === "ssh_kubectl" ||
      (cluster.kind === "kubeconfig" &&
        cluster.source === "imported" &&
        Boolean(cluster.kubeconfig_path));
    return (
      <EntityRow
        embedded
        selected={selectedClusterId === cluster.id}
        icon={<K8sClusterIcon />}
        primary={cluster.display_name}
        onActivate={() => selectCluster(cluster.id)}
        actions={
          canEdit || canRemove ? (
            <>
              {canEdit ? (
                <button
                  type="button"
                  className="saved-item-action"
                  aria-label={t("common:edit")}
                  title={t("k8s:editCluster")}
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditCluster(cluster);
                  }}
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
              ) : null}
              {canRemove ? (
                <button
                  type="button"
                  className="saved-item-action saved-item-delete"
                  aria-label={
                    cluster.kind === "ssh_kubectl"
                      ? t("k8s:removeBinding")
                      : t("common:delete")
                  }
                  title={
                    cluster.kind === "ssh_kubectl"
                      ? t("k8s:removeBinding")
                      : t("k8s:removeImported")
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    if (cluster.kind === "ssh_kubectl") {
                      void removeSshBinding(cluster.id);
                      return;
                    }
                    if (cluster.kubeconfig_path) {
                      void removeImportedKubeconfig(cluster.kubeconfig_path);
                    }
                  }}
                >
                  <svg
                    viewBox="0 0 16 16"
                    width="12"
                    height="12"
                    aria-hidden="true"
                  >
                    <path
                      fill="currentColor"
                      d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.997a.58.58 0 0 0-.01 0H11Zm1.958 1H3.042l.853 10.66A1 1 0 0 0 4.885 15h6.23a1 1 0 0 0 .99-1.84l.853-10.66Z"
                    />
                  </svg>
                </button>
              ) : null}
            </>
          ) : null
        }
      />
    );
  };

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
        <UpdateAvailableBadge floating />
        {sshFormModal}
        {passwordModal}
      </>
    );
  }

  return (
    <>
      <div className="sidebar-shell">
        <aside className="sidebar">
          {sidebarView === "hosts" ? (
            <EntityCatalog
              emptyText={
                savedConnections.length === 0
                  ? t("shell:emptyBookmarks")
                  : null
              }
            >
              <EntityListView
                scope="hosts"
                entityIds={hostEntityIds}
                onAddEntity={openCreateForm}
                onOrderChange={(ids) => void reorderSavedConnections(ids)}
                renderItem={(id) => {
                  const saved = savedById.get(id);
                  return saved ? savedItem(saved) : null;
                }}
              />
            </EntityCatalog>
          ) : null}
          {sidebarView === "k8s" ? (
            <EntityCatalog
              className="k8s-cluster-list"
              loadingText={
                k8sLoading && clusters.length === 0 ? t("k8s:loading") : null
              }
              emptyText={
                !k8sLoading && clusters.length === 0
                  ? t("k8s:emptyClusters")
                  : null
              }
            >
              {k8sEntityIds.length > 0 || !k8sLoading ? (
                <EntityListView
                  scope="k8s"
                  entityIds={k8sEntityIds}
                  onAddEntity={() => setAddClusterOpen(true)}
                  renderItem={(id) => {
                    const cluster = clusterById.get(id);
                    return cluster ? clusterItem(cluster) : null;
                  }}
                />
              ) : null}
            </EntityCatalog>
          ) : null}

          {(sidebarView === "k8s" || hasPendingUpdate) ? (
            <div className="sidebar-footer">
              {sidebarView === "k8s" ? (
                <div className="k8s-sidebar-tools" aria-label={t("k8s:toolsInstallOrUpdate")}>
                  {(["kubectl", "helm"] as const).map((tool) => {
                    const info =
                      tool === "kubectl"
                        ? toolsStatus?.kubectl
                        : toolsStatus?.helm;
                    const status = toolStatus(info);
                    const title = toolTitle(info, tool, t);
                    const canAct = status === "missing" || status === "update";
                    return (
                      <button
                        key={tool}
                        type="button"
                        className={[
                          "k8s-tool-icon-btn",
                          status === "ok" ? "k8s-tool-icon-btn--current" : "",
                          toolsBusy ? "k8s-tool-icon-btn--busy" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        disabled={toolsBusy || !canAct}
                        title={title}
                        aria-label={title}
                        onClick={() => {
                          if (!canAct || toolsBusy) return;
                          void installTools(tool);
                        }}
                      >
                        {tool === "kubectl" ? (
                          <K8sClusterIcon size={20} />
                        ) : (
                          <HelmBrandIcon size={20} />
                        )}
                        <ToolStatusBadge info={info} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span className="sidebar-footer-spacer" aria-hidden />
              )}
              {hasPendingUpdate ? (
                <div className="sidebar-footer-update">
                  <UpdateAvailableBadge />
                </div>
              ) : null}
            </div>
          ) : null}

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
      {editCluster ? (
        <EditK8sClusterModal
          cluster={editCluster}
          onClose={() => setEditCluster(null)}
        />
      ) : null}
    </>
  );
}
