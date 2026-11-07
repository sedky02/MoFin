"use client";

import * as React from "react";
import { useAccounts } from "@/hooks/useAccounts";
import { useUser } from "@/hooks/useUser";
import { selectableOnDashboard } from "@/lib/account-privacy";
import type { Account } from "@/lib/types";
import { ACTIVE_ACCOUNT_COOKIE, ALL_ACCOUNTS as ALL, resolveActiveAccount } from "@/lib/dashboard-scope";

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

/**
 * Mirrored into a cookie because the server can't read localStorage and the dashboard prefetches
 * for the account being shown; it carries an account id, not a secret.
 */
function writeCookie(value: string | undefined) {
  try {
    const secure = location.protocol === "https:" ? "; secure" : "";
    document.cookie = value
      ? `${ACTIVE_ACCOUNT_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax${secure}`
      : `${ACTIVE_ACCOUNT_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
  } catch {
    /* cookies unavailable: the server just falls back to the main account */
  }
}

export function setActiveAccountId(id?: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id ?? ALL);
  } catch {
    /* storage unavailable (private mode): selection just won't persist */
  }
  writeCookie(id ?? ALL);
  listeners.forEach((l) => l());
}

/**
 * Explicit pick, else the main account, else none. "All accounts" is remembered as an explicit
 * choice and never falls back to main.
 */
export function useActiveAccount(initialStored?: string): {
  account: Account | undefined;
  accountId: string | undefined;
  setAccountId: (id?: string) => void;
  accounts: Account[];
} {
  const { data } = useAccounts();
  const { data: user } = useUser();
  // A hidden account is never offered on the dashboard, so it can't stay the active one either.
  const accounts = selectableOnDashboard(data ?? []);
  // The server snapshot is what SSR and the first client render agree on; callers that know the
  // stored choice on the server (the dashboard reads the cookie) pass it in.
  const stored = React.useSyncExternalStore(subscribe, read, () => initialStored);
  // Keep the cookie in step with localStorage, including for people who chose before
  // the cookie existed.
  React.useEffect(() => {
    writeCookie(stored);
  }, [stored]);
  const account = resolveActiveAccount(stored, accounts, user?.settings?.mainAccountId);
  return { account, accountId: account?.id, setAccountId: setActiveAccountId, accounts };
}
