import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAccounts } from "@/hooks/useAccounts";
import { useUser } from "@/hooks/useUser";
import type { Account } from "@/core/types";
import { selectableOnDashboard } from "@/core/account-privacy";
import { ALL_ACCOUNTS as ALL, resolveActiveAccount } from "@/core/dashboard-scope";

// A per-device convenience (like a remembered tab), not server state: it only pre-fills account
// fields. No cookie mirror here: the web needed it so the server could prefetch.
const STORAGE_KEY = "mofin-active-account";
const listeners = new Set<() => void>();
let stored: string | undefined;
let loaded = false;
let loading: Promise<void> | undefined;

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notify() {
  listeners.forEach((l) => l());
}

/** Starts reading the stored pick. Call it behind the splash so it is known before the first screen. */
export function loadActiveAccount(): Promise<void> {
  load();
  return loading ?? Promise.resolve();
}

function load() {
  if (loaded || loading) return;
  loading = AsyncStorage.getItem(STORAGE_KEY)
    .then((v) => {
      // A pick made before the read finished wins over what was on disk.
      if (!loaded) stored = v || undefined;
    })
    .catch(() => {})
    .finally(() => {
      loaded = true;
      loading = undefined;
      notify();
    });
}

export function setActiveAccountId(id?: string) {
  stored = id ?? ALL;
  loaded = true;
  notify();
  AsyncStorage.setItem(STORAGE_KEY, id ?? ALL).catch(() => {
    /* storage unavailable: the selection just won't persist */
  });
}

/** Forgets the pick (memory and disk). The next user to sign in on this device must not inherit it. */
export function clearActiveAccount(): void {
  stored = undefined;
  loaded = true;
  notify();
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

export function resetActiveAccountCache() {
  stored = undefined;
  loaded = false;
  loading = undefined;
}

/**
 * Explicit pick, else main, else none; "All accounts" is explicit and never falls back to main.
 * Resolved against the live list so archived or deleted accounts stop being active.
 */
export function useActiveAccount(): {
  /** False until the stored pick has been read. Until then `account` is the main-account fallback,
   *  so anything that copies it once (a form default) should wait for `ready`. */
  ready: boolean;
  account: Account | undefined;
  accountId: string | undefined;
  setAccountId: (id?: string) => void;
  accounts: Account[];
} {
  const { data } = useAccounts();
  const { data: user } = useUser();
  // A hidden account is never offered on the dashboard, so it can't stay the active one either.
  const accounts = selectableOnDashboard(data ?? []);
  React.useEffect(() => {
    load();
  }, []);
  const current = React.useSyncExternalStore(
    subscribe,
    () => stored,
    () => undefined,
  );
  const ready = React.useSyncExternalStore(
    subscribe,
    () => loaded,
    () => false,
  );
  const account = resolveActiveAccount(current, accounts, user?.settings?.mainAccountId);
  return { ready, account, accountId: account?.id, setAccountId: setActiveAccountId, accounts };
}
