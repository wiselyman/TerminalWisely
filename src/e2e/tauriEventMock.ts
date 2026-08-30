type Handler = (event: { payload: unknown }) => void;

const listeners = new Map<string, Set<Handler>>();

export function __emitTauriEvent(event: string, payload: unknown) {
  listeners.get(event)?.forEach((h) => h({ payload }));
}

export async function listen<T>(
  event: string,
  handler: (event: { event: string; id: number; payload: T }) => void,
): Promise<() => void> {
  const wrapped: Handler = (ev) =>
    handler({ event, id: 0, payload: ev.payload as T });
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(wrapped);
  return () => {
    listeners.get(event)?.delete(wrapped);
  };
}

export async function emit(_event: string, _payload?: unknown): Promise<void> {
  /* no-op for E2E */
}

export async function once<T>(
  event: string,
  handler: (event: { event: string; id: number; payload: T }) => void,
): Promise<() => void> {
  const un = await listen<T>(event, (ev) => {
    un();
    handler(ev);
  });
  return un;
}
