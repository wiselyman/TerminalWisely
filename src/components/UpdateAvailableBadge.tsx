import { useTranslation } from "react-i18next";
import { useAppUpdateStore } from "../stores/appUpdateStore";

function DownloadArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4v12" />
      <path d="M7 12l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

interface UpdateAvailableBadgeProps {
  /** Compact floating chip when the sidebar is collapsed. */
  floating?: boolean;
}

/** Bright download chip — only mounts when a pending update exists. */
export function UpdateAvailableBadge({ floating = false }: UpdateAvailableBadgeProps) {
  const { t } = useTranslation("shell");
  const pending = useAppUpdateStore((s) => s.pending);
  const openDialog = useAppUpdateStore((s) => s.openDialog);

  if (!pending) return null;

  const label = t("updateBadgeAria", { version: pending.update.version });

  return (
    <button
      type="button"
      className={
        floating
          ? "update-available-badge update-available-badge-floating"
          : "update-available-badge"
      }
      title={label}
      aria-label={label}
      onClick={() => openDialog()}
    >
      <DownloadArrowIcon />
    </button>
  );
}
