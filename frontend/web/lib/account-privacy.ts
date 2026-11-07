// How much of an account the person keeps out of sight. One level per account, stored in the
// account metadata (their own choice, so it follows them across devices); every behaviour is read
// from accountVisibility(), never from the string itself.
import type { Account } from "@/lib/types";

export type AccountVisibilityLevel = "visible" | "masked" | "private" | "hidden";

export interface VisibilityEffects {
  /** The balance shows as dots. */
  maskValue: boolean;
  /** The account is part of "All accounts" figures (the server leaves it out of those otherwise). */
  countInTotals: boolean;
  /** The account can be picked on the dashboard. */
  showOnDashboard: boolean;
}

const EFFECTS: Record<AccountVisibilityLevel, VisibilityEffects> = {
  visible: { maskValue: false, countInTotals: true, showOnDashboard: true },
  masked: { maskValue: true, countInTotals: true, showOnDashboard: true },
  private: { maskValue: true, countInTotals: false, showOnDashboard: true },
  hidden: { maskValue: true, countInTotals: false, showOnDashboard: false },
};

export const VISIBILITY_OPTIONS: readonly {
  value: AccountVisibilityLevel;
  label: string;
  effect: string;
}[] = [
  { value: "visible", label: "Visible", effect: "Shows everywhere" },
  { value: "masked", label: "Masked", effect: "Dots, still counted" },
  { value: "private", label: "Private", effect: "Dots, not in totals" },
  { value: "hidden", label: "Hidden", effect: "Not on the dashboard" },
];

/** What a hidden amount shows instead of digits. */
export const MASKED_AMOUNT = "••••";

/** Anything unknown reads as visible, so a bad value never hides money by accident. */
export function visibilityOf(account: Pick<Account, "metadata"> | null | undefined): AccountVisibilityLevel {
  const stored = account?.metadata?.visibility;
  const known = VISIBILITY_OPTIONS.find((o) => o.value === stored);
  if (known) return known.value;
  return account?.metadata?.hideAmount === true ? "private" : "visible";
}

export function accountVisibility(account: Pick<Account, "metadata"> | null | undefined): VisibilityEffects {
  return EFFECTS[visibilityOf(account)];
}

export function isAmountHidden(account: Pick<Account, "metadata"> | null | undefined): boolean {
  return accountVisibility(account).maskValue;
}

/**
 * The account's metadata with the level set, every other key kept: the API replaces `metadata` as
 * a whole, so sending only `{ visibility }` would drop the rest.
 */
export function withVisibility(
  metadata: Account["metadata"],
  level: AccountVisibilityLevel,
): Record<string, unknown> {
  const { visibility: _old, hideAmount: _legacy, ...rest } = metadata ?? {};
  void _old;
  void _legacy;
  return level === "visible" ? rest : { ...rest, visibility: level };
}

/** The accounts the dashboard switcher offers. */
export function selectableOnDashboard<T extends Pick<Account, "metadata">>(accounts: T[]): T[] {
  return accounts.filter((a) => accountVisibility(a).showOnDashboard);
}

/**
 * Accounts left out of "All accounts" figures, optionally only those in `currency` (the figures
 * are per currency). The server already leaves them out; this is for the caption.
 */
export function excludedFromTotals(
  accounts: Pick<Account, "id" | "currency" | "metadata">[] | null | undefined,
  currency?: string,
): string[] {
  return (accounts ?? [])
    .filter((a) => !accountVisibility(a).countInTotals && (!currency || a.currency === currency))
    .map((a) => a.id);
}

/** " · excl. 2 hidden accounts", for an all-accounts caption ("" when none are left out). */
export function hiddenCaption(count: number): string {
  return count > 0 ? ` · excl. ${count} hidden account${count === 1 ? "" : "s"}` : "";
}
