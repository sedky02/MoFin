import { transactionAmount } from "./format";
import { DELETED_ACCOUNT_LABEL, transactionAccountLegs } from "./transaction-accounts";
import type { Account, Transaction } from "./types";

/**
 * How a series root reads in the Recurring view. A root carries the series
 * template (amount, accounts, schedule), which an edit can move away from the
 * root's own ledger legs, so the view reads the template and only falls back
 * to the legs for what the template doesn't name.
 */

type SeriesRoot = Pick<
  Transaction,
  | "type"
  | "items"
  | "recurringAmount"
  | "recurringFromAccountId"
  | "recurringToAccountId"
  | "recurringInterval"
  | "recurringStatus"
  | "nextOccurrenceAt"
>;

/** What each coming occurrence posts: the template amount, or the root's own total without one. */
export function seriesAmount(tx: SeriesRoot): string {
  return tx.recurringAmount ?? transactionAmount(tx);
}

export function seriesIsActive(tx: Pick<Transaction, "recurringStatus">): boolean {
  return tx.recurringStatus === "ACTIVE";
}

export function seriesIsPaused(tx: Pick<Transaction, "recurringStatus">): boolean {
  return tx.recurringStatus === "PAUSED";
}

/** Still running or on hold, so it can be edited, paused or resumed, and cancelled. Not once it's cancelled or ended. */
export function seriesIsOpen(tx: Pick<Transaction, "recurringStatus">): boolean {
  return seriesIsActive(tx) || seriesIsPaused(tx);
}

/**
 * What a paused series shows in place of its next date: the reason when it
 * was paused because it couldn't post, plain "Paused" when the user paused it.
 */
export function seriesPausedLabel(tx: Pick<Transaction, "recurringStatus" | "recurringError">): string | undefined {
  if (!seriesIsPaused(tx)) return undefined;
  return tx.recurringError ? `Paused: ${tx.recurringError}` : "Paused";
}

/**
 * The next date an active series posts on. None once it's paused, cancelled
 * or ended: such a root can still carry the date it would have posted next,
 * already in the past for a series the job paused.
 */
export function seriesNextOccurrence(tx: Pick<Transaction, "recurringStatus" | "nextOccurrenceAt">): string | undefined {
  return seriesIsActive(tx) && tx.nextOccurrenceAt ? tx.nextOccurrenceAt : undefined;
}

export function seriesIntervalLabel(tx: Pick<Transaction, "recurringInterval">): string {
  return tx.recurringInterval === "YEARLY" ? "Yearly" : "Monthly";
}

/**
 * The account(s) the series posts to from now on, "From → To" for a transfer.
 * A name comes from the account list (fetched with status "all", so archived
 * accounts resolve), else from a root leg on the same account. `undefined`
 * while a name can't be resolved yet.
 */
export function seriesAccountLabel(
  tx: SeriesRoot,
  accountsById?: ReadonlyMap<string, Account>,
): string | undefined {
  const legs = transactionAccountLegs(tx);
  const fromId = tx.recurringFromAccountId ?? legs.from?.accountId;
  const toId = tx.recurringToAccountId ?? legs.to?.accountId;

  const name = (id: string | undefined): string | undefined => {
    if (!id) return undefined;
    const listed = accountsById?.get(id)?.name;
    if (listed) return listed;
    const embedded = tx.items.find((item) => item.accountId === id)?.account?.name;
    if (embedded) return embedded;
    return accountsById ? DELETED_ACCOUNT_LABEL : undefined;
  };

  if (tx.type === "TRANSFER") {
    const fromName = name(fromId);
    const toName = name(toId);
    return fromName && toName ? `${fromName} → ${toName}` : (fromName ?? toName);
  }
  return name(tx.type === "INCOME" ? toId : fromId);
}
