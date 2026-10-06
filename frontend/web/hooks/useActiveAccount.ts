"use client";

import * as React from "react";
import { useAccounts } from "@/hooks/useAccounts";
import type { Account } from "@/lib/types";

// A per-browser convenience (like a remembered tab), not server state: it only
// pre-fills account fields, so losing it just means nothing gets pre-filled.
const STORAGE_KEY = "mofin-active-account";
const listeners = new Set<() => void>();

function read(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) || undefined;
  } catch {
    return undefined;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb); // other tabs
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function setActiveAccountId(id?: string) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable (private mode): selection just won't persist */
  }
  listeners.forEach((l) => l());
}

/**
 * The account the user has chosen to work in. Resolved against the live account
 * list, so an archived or deleted account silently stops being "active" instead
 * of pre-filling a stale id. `undefined` = "All accounts" / nothing chosen.
 */
export function useActiveAccount(): {
  account: Account | undefined;
  accountId: string | undefined;
  setAccountId: (id?: string) => void;
  accounts: Account[];
} {
  const { data } = useAccounts();
  const accounts = data ?? [];
  // Server snapshot is undefined so SSR and first client render agree (no hydration mismatch).
  const stored = React.useSyncExternalStore(subscribe, read, () => undefined);
  const account = accounts.find((a) => a.id === stored);
  return { account, accountId: account?.id, setAccountId: setActiveAccountId, accounts };
}
