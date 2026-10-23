export const DEFAULT_HOME_SPLIT_RATIO = 0.5;
export const MIN_HOME_SPLIT_RATIO = 0.2;
export const MAX_HOME_SPLIT_RATIO = 0.8;

export function clampHomeSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_HOME_SPLIT_RATIO;
  return Math.min(MAX_HOME_SPLIT_RATIO, Math.max(MIN_HOME_SPLIT_RATIO, ratio));
}

export function parseHomeSplitRatio(value: string | null): number {
  if (value == null || value.trim() === "") return DEFAULT_HOME_SPLIT_RATIO;
  const ratio = Number(value);
  return Number.isFinite(ratio)
    ? clampHomeSplitRatio(ratio)
    : DEFAULT_HOME_SPLIT_RATIO;
}
