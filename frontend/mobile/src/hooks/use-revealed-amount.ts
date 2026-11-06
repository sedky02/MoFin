import * as React from "react";

// Hidden accounts the user revealed. Kept in memory only: a reload hides them again. Shared by every
// place an account's balance shows, so revealing it on Accounts also shows it on the dashboard.
const revealed = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setAmountRevealed(accountId: string, show: boolean): void {
  if (show === revealed.has(accountId)) return;
  if (show) revealed.add(accountId);
  else revealed.delete(accountId);
  listeners.forEach((l) => l());
}

/** Whether the user revealed this hidden account's amounts, and a way to change it. */
export function useRevealedAmount(accountId: string | undefined): [boolean, (show: boolean) => void] {
  const shown = React.useSyncExternalStore(
    subscribe,
    () => (accountId ? revealed.has(accountId) : false),
    () => false,
  );
  const set = React.useCallback(
    (show: boolean) => {
      if (accountId) setAmountRevealed(accountId, show);
    },
    [accountId],
  );
  return [shown, set];
}
