import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getAppVersion, openReleasesPage } from "../lib/appUpdater";
import { formatAppError } from "../lib/formatAppError";
import { isTauriRuntime } from "../lib/isTauri";
import { showManualUpdateCheckResult } from "../lib/updateCheckFeedback";
import { useAppUpdateStore } from "../stores/appUpdateStore";
import { useDownloadSettingsStore } from "../stores/downloadSettingsStore";
import { useToastStore } from "../stores/toastStore";
import { Modal } from "./Modal";

export function AppSettingsDialog() {
  const { t } = useTranslation("shell");
  const pushToast = useToastStore((s) => s.pushToast);
  const open = useDownloadSettingsStore((s) => s.settingsOpen);
  const preferredDownloadDir = useDownloadSettingsStore((s) => s.preferredDownloadDir);
  const setSettingsOpen = useDownloadSettingsStore((s) => s.setSettingsOpen);
  const setPreferredDownloadDir = useDownloadSettingsStore((s) => s.setPreferredDownloadDir);
  const pickDownloadDirectory = useDownloadSettingsStore((s) => s.pickDownloadDirectory);
  const loadSystemDefault = useDownloadSettingsStore((s) => s.loadSystemDefault);
  const manualCheck = useAppUpdateStore((s) => s.manualCheck);
  const checkingUpdate = useAppUpdateStore((s) => s.checking);
  const [displayPath, setDisplayPath] = useState<string | null>(preferredDownloadDir);
  const [loadingDefault, setLoadingDefault] = useState(false);
  const [appVersion, setAppVersion] = useState<string>("…");

  useEffect(() => {
    if (!open) return;
    setDisplayPath(preferredDownloadDir);
    void getAppVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion("—"));
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

  return (
    <Modal title={t("settingsTitle")} onClose={() => setSettingsOpen(false)}>
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
    </Modal>
  );
}
