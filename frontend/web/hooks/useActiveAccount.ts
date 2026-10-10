"use client";

import * as React from "react";
import { useAccounts } from "@/hooks/useAccounts";
import { useUser } from "@/hooks/useUser";
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
 * Mirror the choice into a cookie. The server can't read localStorage, and the dashboard
 * prefetches its data on the server for the account being shown, so it needs the same value.
 * The cookie carries an account id (not a secret) and is not httpOnly.
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
 * The account the user is working in: their explicit pick, else their main account
 * (Settings), else none. Choosing "All accounts" is remembered as an explicit choice
 * and does not fall back to the main account. Resolved against the live account
 * list, so an archived or deleted account silently stops being "active" instead
 * of pre-filling a stale id. `undefined` = "All accounts".
 */
export function useActiveAccount(initialStored?: string): {
  account: Account | undefined;
  accountId: string | undefined;
  setAccountId: (id?: string) => void;
  accounts: Account[];
} {
  const { data } = useAccounts();
  const { data: user } = useUser();
  const accounts = data ?? [];
  // The server snapshot is what SSR and the first client render agree on (no hydration
  // mismatch). Callers that know the stored choice on the server (the dashboard reads
  // the cookie) pass it in, so the prefetched data matches what is first rendered.
  const stored = React.useSyncExternalStore(subscribe, read, () => initialStored);
  // Keep the cookie in step with localStorage, including for people who chose before
  // the cookie existed.
  React.useEffect(() => {
    writeCookie(stored);
  }, [stored]);
  const account = resolveActiveAccount(stored, accounts, user?.settings?.mainAccountId);
  return { account, accountId: account?.id, setAccountId: setActiveAccountId, accounts };
}
