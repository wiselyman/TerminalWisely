import { useEffect, useState } from "react";
import { siHelm } from "simple-icons/icons";
import { getAppTheme, subscribeAppTheme, type AppTheme } from "../../lib/appTheme";
import { iconFillForTheme } from "../../lib/osLogos";

/** Official Helm mark via simple-icons. */
export function HelmBrandIcon({ size = 18 }: { size?: number }) {
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
      <path d={siHelm.path} fill={iconFillForTheme(siHelm.hex, theme)} />
    </svg>
  );
}
