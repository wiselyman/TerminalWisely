import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PasswdAccountsResult } from "../types";

const empty: PasswdAccountsResult = { users: [], groups: [] };
const cache = new Map<string, PasswdAccountsResult>();

export function usePasswdAccounts(sessionId: string, enabled: boolean) {
  const [accounts, setAccounts] = useState<PasswdAccountsResult>(
    () => cache.get(sessionId) ?? empty,
  );
  const [loading, setLoading] = useState(enabled && !cache.has(sessionId));

  useEffect(() => {
    if (!enabled) return;

    const cached = cache.get(sessionId);
    if (cached) {
      setAccounts(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void invoke<PasswdAccountsResult>("list_passwd_accounts", {
      request: { session_id: sessionId },
    })
      .then((result) => {
        if (cancelled) return;
        const next = {
          users: result.users ?? [],
          groups: result.groups ?? [],
        };
        cache.set(sessionId, next);
        setAccounts(next);
      })
      .catch(() => {
        if (!cancelled) setAccounts(empty);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, sessionId]);

  return { accounts, loading };
}
