"use client";

import * as React from "react";
import { useAccounts } from "@/hooks/useAccounts";
import { useUser } from "@/hooks/useUser";
import type { Account } from "@/lib/types";

// A per-browser convenience (like a remembered tab), not server state: it only
// pre-fills account fields, so losing it just means nothing gets pre-filled.
const STORAGE_KEY = "mofin-active-account";
// Stored when the user explicitly picks "All accounts", so it can be told apart from
// "never chose" (which falls back to the main account).
const ALL = "all";
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
    localStorage.setItem(STORAGE_KEY, id ?? ALL);
  } catch {
    /* storage unavailable (private mode): selection just won't persist */
  }
  listeners.forEach((l) => l());
}

/**
 * The account the user is working in: their explicit pick, else their main account
 * (Settings), else none. Choosing "All accounts" is remembered as an explicit choice
 * and does not fall back to the main account. Resolved against the live account
 * list, so an archived or deleted account silently stops being "active" instead
 * of pre-filling a stale id. `undefined` = "All accounts".
 */
export function useActiveAccount(): {
  account: Account | undefined;
  accountId: string | undefined;
  setAccountId: (id?: string) => void;
  accounts: Account[];
} {
  const { data } = useAccounts();
  const { data: user } = useUser();
  const accounts = data ?? [];
  // Server snapshot is undefined so SSR and first client render agree (no hydration mismatch).
  const stored = React.useSyncExternalStore(subscribe, read, () => undefined);
  const mainId = user?.settings?.mainAccountId;
  const account =
    stored === ALL
      ? undefined
      : (accounts.find((a) => a.id === stored) ?? accounts.find((a) => a.id === mainId));
  return { account, accountId: account?.id, setAccountId: setActiveAccountId, accounts };
}
