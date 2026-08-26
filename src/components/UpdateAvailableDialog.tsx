import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Update } from "@tauri-apps/plugin-updater";
import {
  downloadAndInstallUpdate,
  openReleasesPage,
  relaunchApp,
  type DownloadProgress,
} from "../lib/appUpdater";
import { formatAppError } from "../lib/formatAppError";
import { Modal } from "./Modal";

export type UpdateDialogPhase =
  | "prompt"
  | "downloading"
  | "installed"
  | "error";

interface UpdateAvailableDialogProps {
  update: Update;
  currentVersion: string;
  needsPrivilege: boolean;
  initialPhase?: UpdateDialogPhase;
  onDismiss: () => void;
  /** Called after a successful download/install (badge should clear). */
  onInstalled?: () => void;
}

export function UpdateAvailableDialog({
  update,
  currentVersion,
  needsPrivilege,
  initialPhase = "prompt",
  onDismiss,
  onInstalled,
}: UpdateAvailableDialogProps) {
  const { t } = useTranslation("shell");
  const [phase, setPhase] = useState<UpdateDialogPhase>(initialPhase);
  const [progress, setProgress] = useState<DownloadProgress>({
    downloaded: 0,
    contentLength: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPhase(initialPhase);
  }, [initialPhase, update.version]);

  const pct =
    progress.contentLength && progress.contentLength > 0
      ? Math.min(
          100,
          Math.round((progress.downloaded / progress.contentLength) * 100),
        )
      : null;

  const startInstall = async () => {
    setBusy(true);
    setError(null);
    setPhase("downloading");
    try {
      await downloadAndInstallUpdate(update, setProgress);
      setPhase("installed");
      onInstalled?.();
    } catch (err) {
      setError(formatAppError(err));
      setPhase("error");
    } finally {
      setBusy(false);
    }
  };

  const title =
    phase === "installed"
      ? t("updateInstalledTitle")
      : phase === "downloading"
        ? t("updateDownloadingTitle")
        : phase === "error"
          ? t("updateErrorTitle")
          : t("updateAvailableTitle");

  return (
    <Modal title={title} onClose={busy ? () => undefined : onDismiss}>
      <section className="app-settings-section">
        {phase === "prompt" || phase === "error" ? (
          <>
            <p className="app-settings-hint">
              {t("updateAvailableBody", {
                version: update.version,
                current: currentVersion,
              })}
            </p>
            {needsPrivilege ? (
              <p className="app-settings-hint">{t("updateNeedsPrivilege")}</p>
            ) : null}
            {update.body ? (
              <pre className="update-notes">{update.body}</pre>
            ) : null}
            {error ? <p className="update-error">{error}</p> : null}
            <div className="app-settings-actions">
              <button
                type="button"
                className="find-panel-run primary"
                disabled={busy}
                onClick={() => void startInstall()}
              >
                {t("updateInstall")}
              </button>
              <button
                type="button"
                className="find-panel-run"
                disabled={busy}
                onClick={onDismiss}
              >
                {t("updateLater")}
              </button>
              <button
                type="button"
                className="find-panel-run"
                disabled={busy}
                onClick={() => void openReleasesPage()}
              >
                {t("updateOpenReleases")}
              </button>
            </div>
          </>
        ) : null}

        {phase === "downloading" ? (
          <>
            <p className="app-settings-hint">{t("updateDownloadingHint")}</p>
            <div
              className="update-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct ?? undefined}
            >
              <div
                className="update-progress-bar"
                style={{ width: `${pct ?? 15}%` }}
              />
            </div>
            <p className="app-settings-path">
              {pct != null
                ? t("updateProgressPct", { pct })
                : t("updateProgressIndeterminate")}
            </p>
          </>
        ) : null}

        {phase === "installed" ? (
          <>
            <p className="app-settings-hint">{t("updateInstalledBody")}</p>
            <div className="app-settings-actions">
              <button
                type="button"
                className="find-panel-run primary"
                onClick={() => void relaunchApp()}
              >
                {t("updateRelaunch")}
              </button>
              <button type="button" className="find-panel-run" onClick={onDismiss}>
                {t("updateRelaunchLater")}
              </button>
            </div>
          </>
        ) : null}
      </section>
    </Modal>
  );
}
