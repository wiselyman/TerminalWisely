import type { AppLocale } from "../i18n";

export type LocaleFlagId = "cn" | "us";

/** Stable id for the two supported app locales (no emoji / no animation). */
export function localeFlagId(locale: AppLocale): LocaleFlagId {
  return locale === "zh-CN" ? "cn" : "us";
}

type FlagProps = {
  locale: AppLocale;
  className?: string;
  title?: string;
};

/** Regular five-pointed star path (outer/inner radii). Angle in degrees, 0 = east. */
function starPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  tipAngleDeg: number,
): string {
  const parts: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((tipAngleDeg + i * 36) * Math.PI) / 180;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    parts.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `${parts.join(" ")} Z`;
}

/**
 * 五星红旗 on a 30×20 construction grid, scaled into viewBox 24×16.
 * Large star + four small stars arc toward the large star (not Vietnam’s single star).
 */
export function chineseFlagStarPaths(viewW = 24, viewH = 16): string[] {
  const sx = viewW / 30;
  const sy = viewH / 20;
  const large = { x: 5 * sx, y: 5 * sy, r: 3 * Math.min(sx, sy) };
  const smallCenters: Array<[number, number]> = [
    [10, 2],
    [12, 4],
    [12, 7],
    [10, 9],
  ];
  const smallR = 1 * Math.min(sx, sy);
  const innerRatio = 0.382;

  const largePath = starPath(
    large.x,
    large.y,
    large.r,
    large.r * innerRatio,
    -90,
  );

  const smallPaths = smallCenters.map(([gx, gy]) => {
    const cx = gx * sx;
    const cy = gy * sy;
    // Tip points toward the large star center.
    const tipDeg = (Math.atan2(large.y - cy, large.x - cx) * 180) / Math.PI;
    return starPath(cx, cy, smallR, smallR * innerRatio, tipDeg);
  });

  return [largePath, ...smallPaths];
}

/** Flat rectangular locale marks — avoid emoji “waving flag” glyphs. */
export function LocaleFlagMark({ locale, className, title }: FlagProps) {
  const id = localeFlagId(locale);
  const cls = ["locale-flag-mark", className].filter(Boolean).join(" ");
  if (id === "cn") {
    const stars = chineseFlagStarPaths();
    return (
      <svg
        className={cls}
        viewBox="0 0 24 16"
        width="18"
        height="12"
        aria-hidden={title ? undefined : true}
        role={title ? "img" : undefined}
        aria-label={title}
        data-locale-flag="cn"
        data-star-count={stars.length}
      >
        {title ? <title>{title}</title> : null}
        <rect width="24" height="16" fill="#de2910" />
        {stars.map((d) => (
          <path key={d} fill="#ffde00" d={d} />
        ))}
      </svg>
    );
  }
  return (
    <svg
      className={cls}
      viewBox="0 0 24 16"
      width="18"
      height="12"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
      data-locale-flag="us"
    >
      {title ? <title>{title}</title> : null}
      <rect width="24" height="16" fill="#fff" />
      <rect y="0" width="24" height="2.286" fill="#b22234" />
      <rect y="4.571" width="24" height="2.286" fill="#b22234" />
      <rect y="9.143" width="24" height="2.286" fill="#b22234" />
      <rect y="13.714" width="24" height="2.286" fill="#b22234" />
      <rect width="10" height="8.5" fill="#3c3b6e" />
    </svg>
  );
}

/** Stable alias used by tests / callers that only need the id. */
export function localeFlag(locale: AppLocale): LocaleFlagId {
  return localeFlagId(locale);
}
