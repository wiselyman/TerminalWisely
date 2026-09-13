import { useEffect, useState } from "react";
import type { SimpleIcon } from "simple-icons";
import { siLinux } from "simple-icons/icons";
import { getAppTheme, subscribeAppTheme, type AppTheme } from "../lib/appTheme";
import { iconFillForTheme, logoForOsId } from "../lib/osLogos";

interface ServerOsIconProps {
  osId?: string | null;
  osName?: string | null;
  size?: number;
  /** When false, omit native title so parent controls the tooltip. */
  showTitle?: boolean;
}

function BrandLogo({
  icon,
  size,
  theme,
}: {
  icon: SimpleIcon;
  size: number;
  theme: AppTheme;
}) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path d={icon.path} fill={iconFillForTheme(icon.hex, theme)} />
    </svg>
  );
}

function SshIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
        fill="var(--tw-surface-2)"
      />
      <path
        d="M7 10.5 9.5 13 7 15.5M12 15.5h5"
        fill="none"
        stroke="var(--tw-accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ServerOsIcon({
  osId,
  osName,
  size = 22,
  showTitle = true,
}: ServerOsIconProps) {
  const [theme, setTheme] = useState<AppTheme>(() => getAppTheme());
  useEffect(() => subscribeAppTheme(setTheme), []);

  const normalized = osId?.trim().toLowerCase();
  const icon = normalized ? logoForOsId(normalized) : null;
  const title = osName?.trim() || icon?.title || normalized || "SSH 服务器";

  return (
    <span
      className="server-os-icon"
      title={showTitle ? title : undefined}
    >
      {icon ? (
        <BrandLogo icon={icon} size={size} theme={theme} />
      ) : normalized ? (
        <BrandLogo icon={siLinux} size={size} theme={theme} />
      ) : (
        <SshIcon size={size} />
      )}
    </span>
  );
}
