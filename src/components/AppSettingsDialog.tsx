import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getAppVersion, openReleasesPage } from "../lib/appUpdater";
import { formatAppError } from "../lib/formatAppError";
import { isTauriRuntime } from "../lib/isTauri";
import { showManualUpdateCheckResult } from "../lib/updateCheckFeedback";
import {
  getAiUserMcp,
  saveAiUserMcp,
  type AiUserMcpView,
} from "../lib/aiEngineer/api";
import {
  buildMcpInstallPrompt,
  detectMcpPlatform,
  listMcpCatalogForPlatform,
  type McpCatalogListed,
} from "../lib/aiEngineer/mcpCatalog";
import {
  mergeUserMcpServer,
  parseUserMcpConfig,
  removeUserMcpServer,
} from "../lib/aiEngineer/userMcpConfig";
import { useAppUpdateStore } from "../stores/appUpdateStore";
import { useAiEngineerStore } from "../stores/aiEngineerStore";
import { useDownloadSettingsStore } from "../stores/downloadSettingsStore";
import { useToastStore } from "../stores/toastStore";
import { Modal } from "./Modal";

function parseEnvLines(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

export function AppSettingsDialog() {
  const { t, i18n } = useTranslation("shell");
  const pushToast = useToastStore((s) => s.pushToast);
  const open = useDownloadSettingsStore((s) => s.settingsOpen);
  const preferredDownloadDir = useDownloadSettingsStore((s) => s.preferredDownloadDir);
  const setSettingsOpen = useDownloadSettingsStore((s) => s.setSettingsOpen);
  const setPreferredDownloadDir = useDownloadSettingsStore((s) => s.setPreferredDownloadDir);
  const pickDownloadDirectory = useDownloadSettingsStore((s) => s.pickDownloadDirectory);
  const loadSystemDefault = useDownloadSettingsStore((s) => s.loadSystemDefault);
  const manualCheck = useAppUpdateStore((s) => s.manualCheck);
  const checkingUpdate = useAppUpdateStore((s) => s.checking);
  const sendLocalInstallPrompt = useAiEngineerStore((s) => s.sendLocalInstallPrompt);
  const [displayPath, setDisplayPath] = useState<string | null>(preferredDownloadDir);
  const [loadingDefault, setLoadingDefault] = useState(false);
  const [appVersion, setAppVersion] = useState<string>("…");
  const [mcpView, setMcpView] = useState<AiUserMcpView | null>(null);
  const [secretDrafts, setSecretDrafts] = useState<Record<string, Record<string, string>>>({});
  const [customName, setCustomName] = useState("");
  const [customCommand, setCustomCommand] = useState("");
  const [customArgs, setCustomArgs] = useState("");
  const [customEnv, setCustomEnv] = useState("");
  const platform = detectMcpPlatform();
  const catalog = useMemo(() => listMcpCatalogForPlatform(platform), [platform]);

  useEffect(() => {
    if (!open) return;
    setDisplayPath(preferredDownloadDir);
    void getAppVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion("—"));
    void getAiUserMcp()
      .then(setMcpView)
      .catch(() => setMcpView(null));
    if (preferredDownloadDir) return;
    setLoadingDefault(true);
    void loadSystemDefault()
      .then((path) => setDisplayPath(path))
      .catch(() => setDisplayPath(null))
      .finally(() => setLoadingDefault(false));
  }, [open, preferredDownloadDir, loadSystemDefault]);

  if (!open) return null;

  const chooseFolder = async () => {
    try {
      const picked = await pickDownloadDirectory();
      if (!picked) return;
      setPreferredDownloadDir(picked);
      setDisplayPath(picked);
      pushToast(t("settingsDownloadDirSaved", { path: picked }), true);
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  const useSystemDefault = async () => {
    try {
      const path = await loadSystemDefault();
      setPreferredDownloadDir(path);
      setDisplayPath(path);
      pushToast(t("settingsDownloadDirSaved", { path }), true);
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  const onCheckUpdate = async () => {
    if (!isTauriRuntime()) {
      pushToast(t("updateOnlyInApp"), false);
      return;
    }
    const result = await manualCheck();
    if (result.status === "available") {
      setSettingsOpen(false);
      return;
    }
    await showManualUpdateCheckResult(result);
  };

  const locale = i18n.language?.toLowerCase().startsWith("zh") ? "zh" : "en";

  const onInstall = async (entry: McpCatalogListed) => {
    if (!entry.installable) return;
    const keys = entry.register.envKeys ?? [];
    const env = secretDrafts[entry.id] ?? {};
    if (keys.length && keys.some((k) => !String(env[k] || "").trim())) {
      pushToast(t("settingsMcpNeedsSecrets"), false);
      return;
    }
    const text = buildMcpInstallPrompt(entry, {
      locale,
      env,
      configPath: mcpView?.path,
    });
    setSettingsOpen(false);
    try {
      await sendLocalInstallPrompt(text);
      pushToast(t("settingsMcpInstallSent"), true);
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  const onRemove = async (name: string) => {
    try {
      const current = mcpView?.text ?? '{"mcpServers":{}}';
      const next = removeUserMcpServer(current, name);
      const view = await saveAiUserMcp(next);
      setMcpView(view);
      pushToast(t("settingsMcpRemoved", { name }), true);
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  const onSaveCustom = async () => {
    const name = customName.trim();
    const command = customCommand.trim();
    if (!name || !command) return;
    try {
      const current = mcpView?.text ?? '{"mcpServers":{}}';
      const args = customArgs.trim()
        ? customArgs.trim().split(/\s+/).filter(Boolean)
        : [];
      const env = parseEnvLines(customEnv);
      const next = mergeUserMcpServer(current, {
        name,
        command,
        args,
        env: Object.keys(env).length ? env : undefined,
      });
      // Ensure merge stayed valid
      parseUserMcpConfig(next);
      const view = await saveAiUserMcp(next);
      setMcpView(view);
      setCustomName("");
      setCustomCommand("");
      setCustomArgs("");
      setCustomEnv("");
      pushToast(t("settingsMcpSaved"), true);
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  return (
    <Modal wide title={t("settingsTitle")} onClose={() => setSettingsOpen(false)}>
      <section className="app-settings-section">
        <h3 className="app-settings-label">{t("settingsAbout")}</h3>
        <p className="app-settings-path">
          {t("settingsAppVersion", { version: appVersion })}
        </p>
        <div className="app-settings-actions">
          <button
            type="button"
            className="find-panel-run primary"
            disabled={checkingUpdate}
            onClick={() => void onCheckUpdate()}
          >
            {checkingUpdate ? t("updateChecking") : t("updateCheck")}
          </button>
          <button
            type="button"
            className="find-panel-run"
            onClick={() => void openReleasesPage()}
          >
            {t("updateOpenReleases")}
          </button>
        </div>
      </section>

      <section className="app-settings-section">
        <h3 className="app-settings-label">{t("settingsDownloadDir")}</h3>
        <p className="app-settings-hint">{t("settingsDownloadDirHint")}</p>
        <p className="app-settings-path">
          {loadingDefault
            ? t("settingsLoadingDefault")
            : displayPath ?? t("settingsDownloadDirUnset")}
        </p>
        <div className="app-settings-actions">
          <button
            type="button"
            className="find-panel-run primary"
            onClick={() => void chooseFolder()}
          >
            {t("settingsChooseFolder")}
          </button>
          <button
            type="button"
            className="find-panel-run"
            onClick={() => void useSystemDefault()}
          >
            {t("settingsUseSystemDefault")}
          </button>
        </div>
      </section>

      <section className="app-settings-section" data-testid="settings-mcp-section">
        <h3 className="app-settings-label">{t("settingsMcpTools")}</h3>
        <p className="app-settings-hint">{t("settingsMcpHint")}</p>
        {mcpView?.path ? (
          <p className="app-settings-path">
            {t("settingsMcpConfigPath", { path: mcpView.path })}
          </p>
        ) : null}

        <h4 className="app-settings-label">{t("settingsMcpCatalog")}</h4>
        <div className="app-settings-mcp-list" data-testid="settings-mcp-catalog">
          {catalog.map((entry) => {
            const keys = entry.register.envKeys ?? [];
            const drafts = secretDrafts[entry.id] ?? {};
            return (
              <div
                key={entry.id}
                className={`app-settings-mcp-row${entry.installable ? "" : " is-disabled"}`}
                data-testid={`settings-mcp-${entry.id}`}
              >
                <div className="app-settings-mcp-meta">
                  <p className="app-settings-mcp-title">
                    {t(`mcpCatalog.${entry.category}`)} · {entry.name}
                    {!entry.installable ? ` (${t("settingsMcpOtherOs")})` : ""}
                  </p>
                  <p className="app-settings-mcp-summary">{entry.summary}</p>
                  {entry.installable && keys.length > 0 ? (
                    <div className="app-settings-mcp-secrets">
                      {keys.map((key) => (
                        <input
                          key={key}
                          type="password"
                          autoComplete="off"
                          placeholder={key}
                          value={drafts[key] ?? ""}
                          onChange={(ev) =>
                            setSecretDrafts((prev) => ({
                              ...prev,
                              [entry.id]: {
                                ...(prev[entry.id] ?? {}),
                                [key]: ev.target.value,
                              },
                            }))
                          }
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="find-panel-run"
                  disabled={!entry.installable}
                  data-testid={`settings-mcp-install-${entry.id}`}
                  onClick={() => void onInstall(entry)}
                >
                  {t("settingsMcpInstall")}
                </button>
              </div>
            );
          })}
        </div>

        <h4 className="app-settings-label">{t("settingsMcpRegistered")}</h4>
        <div className="app-settings-mcp-list" data-testid="settings-mcp-registered">
          {(mcpView?.servers?.length ?? 0) === 0 ? (
            <p className="app-settings-hint empty-state">{t("settingsMcpEmptyRegistered")}</p>
          ) : (
            mcpView!.servers.map((server) => (
              <div key={server.name} className="app-settings-mcp-row">
                <div className="app-settings-mcp-meta">
                  <p className="app-settings-mcp-title">{server.name}</p>
                  <p className="app-settings-mcp-summary">
                    {server.command} {server.args.join(" ")}
                  </p>
                </div>
                <button
                  type="button"
                  className="find-panel-run"
                  data-testid={`settings-mcp-remove-${server.name}`}
                  onClick={() => void onRemove(server.name)}
                >
                  {t("settingsMcpRemove")}
                </button>
              </div>
            ))
          )}
        </div>

        <h4 className="app-settings-label">{t("settingsMcpCustom")}</h4>
        <div className="app-settings-mcp-custom">
          <input
            data-testid="settings-mcp-custom-name"
            placeholder={t("settingsMcpName")}
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
          />
          <input
            data-testid="settings-mcp-custom-command"
            placeholder={t("settingsMcpCommand")}
            value={customCommand}
            onChange={(e) => setCustomCommand(e.target.value)}
          />
          <input
            data-testid="settings-mcp-custom-args"
            placeholder={t("settingsMcpArgs")}
            value={customArgs}
            onChange={(e) => setCustomArgs(e.target.value)}
          />
          <textarea
            data-testid="settings-mcp-custom-env"
            rows={3}
            placeholder={t("settingsMcpEnv")}
            value={customEnv}
            onChange={(e) => setCustomEnv(e.target.value)}
          />
          <div className="app-settings-actions">
            <button
              type="button"
              className="find-panel-run primary"
              data-testid="settings-mcp-custom-save"
              onClick={() => void onSaveCustom()}
            >
              {t("settingsMcpSaveCustom")}
            </button>
          </div>
        </div>
      </section>
    </Modal>
  );
}
