import { useAccounts } from "@/hooks/useAccounts";
import { writableAccounts } from "@/core/account-sharing";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useMainAccount } from "@/hooks/useMainAccount";
import { useRecentTransactions } from "@/hooks/useSearch";

/** How many recent transactions are tallied to find the account used most. */
const RECENT_WINDOW = 30;

/**
 * Default account for a new transaction: active, else main, else the only one, else the most used
 * recently (ties to the latest), else the first. Archived accounts are never suggested.
 */
export function useSuggestedAccountId(): string | undefined {
  const { data: allAccounts = [] } = useAccounts();
  const accounts = writableAccounts(allAccounts);
  const { accountId: activeId } = useActiveAccount();
  const { accountId: mainId } = useMainAccount();
  const { data: recent } = useRecentTransactions(RECENT_WINDOW);

  if (accounts.length === 0) return undefined;
  const known = new Set(accounts.map((a) => a.id));
  // A view-only account can be active or main, but nothing can be posted to it.
  if (activeId && known.has(activeId)) return activeId;
  if (mainId && known.has(mainId)) return mainId;
  if (accounts.length === 1) return accounts[0].id;

  const counts = new Map<string, number>();
  // Newest first, so on a tie the first account seen (most recent) wins below.
  for (const tx of recent ?? []) {
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
