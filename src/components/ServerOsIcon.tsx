import type { SimpleIcon } from "simple-icons";
import { siLinux } from "simple-icons/icons";
import { logoForOsId } from "../lib/osLogos";

interface ServerOsIconProps {
  osId?: string | null;
  osName?: string | null;
  size?: number;
  /** When false, omit native title so parent controls the tooltip. */
  showTitle?: boolean;
}

function BrandLogo({ icon, size }: { icon: SimpleIcon; size: number }) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path d={icon.path} fill={`#${icon.hex}`} />
    </svg>
  );
}

function SshIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" fill="#30363d" />
      <path
        d="M7 10.5 9.5 13 7 15.5M12 15.5h5"
        fill="none"
        stroke="#58a6ff"
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
  const normalized = osId?.trim().toLowerCase();
  const icon = normalized ? logoForOsId(normalized) : null;
  const title = osName?.trim() || icon?.title || normalized || "SSH 服务器";

  return (
    <span
      className="server-os-icon"
      title={showTitle ? title : undefined}
    >
      {icon ? (
        <BrandLogo icon={icon} size={size} />
      ) : normalized ? (
        <BrandLogo icon={siLinux} size={size} />
      ) : (
        <SshIcon size={size} />
      )}
    </span>
  );
}
