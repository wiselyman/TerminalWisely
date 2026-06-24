import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const cache = new Map<string, string[]>();

export function useSystemdUnits(sessionId: string, enabled: boolean) {
  const [units, setUnits] = useState<string[]>(() => cache.get(sessionId) ?? []);
  const [loading, setLoading] = useState(enabled && !cache.has(sessionId));

  useEffect(() => {
    if (!enabled) return;

    const cached = cache.get(sessionId);
    if (cached) {
      setUnits(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void invoke<{ units: string[] }>("list_systemd_units", {
      request: { session_id: sessionId },
    })
      .then((result) => {
        if (cancelled) return;
        const next = result.units ?? [];
        cache.set(sessionId, next);
        setUnits(next);
      })
      .catch(() => {
        if (!cancelled) setUnits([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, sessionId]);

  return { units, loading };
}
