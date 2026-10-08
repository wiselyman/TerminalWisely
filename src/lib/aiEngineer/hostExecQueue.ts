/** One SSH session: host execs from parallel compare voices run one at a time. */

const chains = new Map<string, Promise<void>>();

export function enqueueHostExec<T>(
  sessionId: string,
  job: () => Promise<T>,
): Promise<T> {
  const key = sessionId || "_";
  const prev = chains.get(key) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(job);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  chains.set(key, tail);
  return run;
}

/** Test hook. */
export function resetHostExecQueue(): void {
  chains.clear();
}
