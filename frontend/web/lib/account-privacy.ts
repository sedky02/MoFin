// An account whose amounts the user chose to hide (Edit account → Hide balance). The choice is
// stored in the account's metadata, so it follows them to every device. Hidden amounts show as dots
// until the user reveals them, which lasts until the app is reloaded.
import type { Account } from "@/lib/types";

/** What a hidden amount shows instead of digits. */
export const MASKED_AMOUNT = "••••";

export function isAmountHidden(account: Pick<Account, "metadata"> | null | undefined): boolean {
  return account?.metadata?.hideAmount === true;
}

/**
 * The account's metadata with the choice set, every other key kept: the API replaces `metadata`
 * as a whole, so sending only `{ hideAmount }` would drop the rest.
 */
export function withHideAmount(
  metadata: Account["metadata"],
  hide: boolean,
): Record<string, unknown> {
  const { hideAmount: _old, ...rest } = metadata ?? {};
  void _old;
  return hide ? { ...rest, hideAmount: true } : rest;
}
