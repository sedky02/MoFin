"use client";

import { useAccounts } from "@/hooks/useAccounts";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useMainAccount } from "@/hooks/useMainAccount";
import { useRecentTransactions } from "@/hooks/useSearch";

/** How many recent transactions are tallied to find the account used most. */
const RECENT_WINDOW = 30;

/**
 * The account a new transaction should default to, in priority order:
 *   1. the active account (top-bar picker),
 *   2. the main account (Settings preference),
 *   3. the only account, if there is just one,
 *   4. the account used most across recent transactions (ties go to the most recent),
 *   5. the first account.
 * Every candidate is resolved against the live account list, so an archived
 * account is never suggested. `undefined` only while there are no accounts.
 */
export function useSuggestedAccountId(): string | undefined {
  const { data: accounts = [] } = useAccounts();
  const { accountId: activeId } = useActiveAccount();
  const { accountId: mainId } = useMainAccount();
  const { data: recent } = useRecentTransactions(RECENT_WINDOW);

  if (accounts.length === 0) return undefined;
  if (activeId) return activeId;
  if (mainId) return mainId;
  if (accounts.length === 1) return accounts[0].id;

  const known = new Set(accounts.map((a) => a.id));
  const counts = new Map<string, number>();
  // Newest first, so on a tie the first account seen (most recent) wins below.
  for (const tx of recent ?? []) {
    if (tx.voidedAt || tx.reversesTransactionId) continue;
    for (const id of new Set(tx.items.map((i) => i.accountId))) {
      if (known.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [id, n] of counts) {
    if (n > bestCount) {
      best = id;
      bestCount = n;
    }
  }
  return best ?? accounts[0].id;
}
