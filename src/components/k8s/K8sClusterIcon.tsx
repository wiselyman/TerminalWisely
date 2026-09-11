import { siKubernetes } from "simple-icons/icons";
import { iconFillForDarkUi } from "../../lib/osLogos";

/** Official Kubernetes mark via simple-icons (same brand source as OS logos). */
export function K8sClusterIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path d={siKubernetes.path} fill={iconFillForDarkUi(siKubernetes.hex)} />
    </svg>
  );
}
