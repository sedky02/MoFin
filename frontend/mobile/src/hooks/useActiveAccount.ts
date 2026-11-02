import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAccounts } from "@/hooks/useAccounts";
import { useUser } from "@/hooks/useUser";
import type { Account } from "@/core/types";
import { ALL_ACCOUNTS as ALL, resolveActiveAccount } from "@/core/dashboard-scope";

// A per-device convenience (like a remembered tab), not server state: it only pre-fills
// account fields, so losing it just means nothing gets pre-filled. There is no cookie
// mirror here: the web needed it so the server could prefetch.
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

/** Test helper: forget the in-memory copy. */
export function resetActiveAccountCache() {
  stored = undefined;
  loaded = false;
  loading = undefined;
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
  React.useEffect(() => {
    load();
  }, []);
  const current = React.useSyncExternalStore(
    subscribe,
    () => stored,
    () => undefined,
  );
  const account = resolveActiveAccount(current, accounts, user?.settings?.mainAccountId);
  return { account, accountId: account?.id, setAccountId: setActiveAccountId, accounts };
}
