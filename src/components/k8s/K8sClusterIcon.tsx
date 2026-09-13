import { useEffect, useState } from "react";
import { siKubernetes } from "simple-icons/icons";
import { getAppTheme, subscribeAppTheme, type AppTheme } from "../../lib/appTheme";
import { iconFillForTheme } from "../../lib/osLogos";

/** Official Kubernetes mark via simple-icons (same brand source as OS logos). */
export function K8sClusterIcon({ size = 18 }: { size?: number }) {
  const [theme, setTheme] = useState<AppTheme>(() => getAppTheme());
  useEffect(() => subscribeAppTheme(setTheme), []);

  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path
        d={siKubernetes.path}
        fill={iconFillForTheme(siKubernetes.hex, theme)}
      />
    </svg>
  );
}
