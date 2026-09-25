/**
 * Read-only host probes often end with a filter (grep/awk/…).
 * Exit 1 + empty stderr + non-empty stdout usually means "some filter
 * matched nothing", not a broken host command — do not paint Failed or
 * burn the tool budget retrying the same probe.
 */

export type ReadProbeOutcomeInput = {
  exitCode: number | null | undefined;
  stdout?: string | null;
  stderr?: string | null;
  timedOut?: boolean;
};

export type ReadProbeOutcome =
  | { kind: "ok" }
  | { kind: "failed"; error: string }
  | {
      kind: "filter_no_match";
      /** Keep reporting the real exit code; UI/model should not treat as hard fail. */
      note: string;
    };

const FILTER_NO_MATCH_NOTE =
  "Non-zero exit with empty stderr and non-empty stdout usually means a " +
  "trailing filter matched nothing. Use the stdout; do not retry the same probe.";

export function interpretReadProbeOutcome(
  input: ReadProbeOutcomeInput,
): ReadProbeOutcome {
  if (input.timedOut) {
    return {
      kind: "failed",
      error: "timed out (no output, idle after output, or exceeded time limit)",
    };
  }
  const code =
    typeof input.exitCode === "number" && Number.isFinite(input.exitCode)
      ? input.exitCode
      : null;
  if (code === null) {
    return { kind: "failed", error: "exit_code missing" };
  }
  if (code === 0) return { kind: "ok" };

  const stdout = String(input.stdout ?? "").trim();
  const stderr = String(input.stderr ?? "").trim();
  // Classic filter-miss / soft boolean: exit 1, silence on stderr, evidence on stdout.
  if (code === 1 && !stderr && stdout.length > 0) {
    return { kind: "filter_no_match", note: FILTER_NO_MATCH_NOTE };
  }
  return { kind: "failed", error: `exit_code ${code}` };
}
