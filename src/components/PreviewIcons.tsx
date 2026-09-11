/**
 * Icons copied verbatim from Lucide (ISC): https://lucide.dev/icons
 * Do not hand-draw paths — pick an icon name and paste its SVG children.
 */

const iconProps = {
  width: 16,
  height: 16,
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

// lucide: save
export function PreviewSaveIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <path d="M15.2 3H5.8a1.8 1.8 0 0 0-1.8 1.8v14.4a1.8 1.8 0 0 0 1.8 1.8h12.4a1.8 1.8 0 0 0 1.8-1.8V6.8L15.2 3z" />
      <path d="M17 3v5H9V3" />
      <path d="M9 15h6" />
    </svg>
  );
}

// lucide: external-link
export function PreviewExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

// lucide: x
export function PreviewCloseIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

// lucide: code-xml
export function PreviewSourceIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <path d="m18 16 4-4-4-4" />
      <path d="m6 8-4 4 4 4" />
      <path d="m14.5 4-5 16" />
    </svg>
  );
}

// lucide: eye
export function PreviewRenderedIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// lucide: maximize-2
export function PreviewMaximizeIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" x2="14" y1="3" y2="10" />
      <line x1="3" x2="10" y1="21" y2="14" />
    </svg>
  );
}

// lucide: minimize-2
export function PreviewRestoreIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" x2="21" y1="10" y2="3" />
      <line x1="3" x2="10" y1="21" y2="14" />
    </svg>
  );
}

// lucide: chevron-up
export function PreviewChevronUpIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

// lucide: chevron-down
export function PreviewChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// lucide: minus
export function PreviewMinimizeIcon() {
  return (
    <svg viewBox="0 0 24 24" {...iconProps}>
      <path d="M5 12h14" />
    </svg>
  );
}
