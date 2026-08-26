import { siHelm } from "simple-icons/icons";
import { iconFillForDarkUi } from "../../lib/osLogos";

/** Official Helm mark via simple-icons. */
export function HelmBrandIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path d={siHelm.path} fill={iconFillForDarkUi(siHelm.hex)} />
    </svg>
  );
}
