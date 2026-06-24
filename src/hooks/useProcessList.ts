import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ProcessEntry } from "../types";

const cache = new Map<string, ProcessEntry[]>();

export function useProcessList(sessionId: string, enabled: boolean) {
  const [processes, setProcesses] = useState<ProcessEntry[]>(
    () => cache.get(sessionId) ?? [],
  );
  const [loading, setLoading] = useState(enabled && !cache.has(sessionId));

  useEffect(() => {
    if (!enabled) return;

    const cached = cache.get(sessionId);
    if (cached) {
      setProcesses(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void invoke<{ processes: ProcessEntry[] }>("list_processes", {
      request: { session_id: sessionId, mode: "basic" },
    })
      .then((result) => {
        if (cancelled) return;
        const next = [...(result.processes ?? [])].sort(
          (a, b) => b.cpu_percent - a.cpu_percent,
        );
        cache.set(sessionId, next);
        setProcesses(next);
      })
      .catch(() => {
        if (!cancelled) setProcesses([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, sessionId]);

  return { processes, loading };
}
