/** Cursor-style morphing 2×3 busy glyph (not a static 7-dot wave). */

type AiBusyDotsProps = {
  className?: string;
  "data-testid"?: string;
};

export function AiBusyDots({ className, "data-testid": testId }: AiBusyDotsProps) {
  const cls = ["ai-engineer-busy-dots", className].filter(Boolean).join(" ");
  return (
    <span className={cls} aria-hidden data-testid={testId}>
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}
