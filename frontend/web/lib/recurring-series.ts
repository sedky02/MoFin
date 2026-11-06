import { transactionAmount } from "./format";
import { DELETED_ACCOUNT_LABEL, transactionAccountLegs } from "./transaction-accounts";
import type { Account, Transaction } from "./types";

/**
 * How a series root reads in the Recurring view: from the series template (amount, accounts,
 * schedule), which an edit can move away from the root's own legs, falling back to the legs.
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
 * The next date an active series posts on; none once paused, cancelled or ended, since such a root
 * can still carry a date already in the past (a series the job paused).
 */
export function seriesNextOccurrence(tx: Pick<Transaction, "recurringStatus" | "nextOccurrenceAt">): string | undefined {
  return seriesIsActive(tx) && tx.nextOccurrenceAt ? tx.nextOccurrenceAt : undefined;
}

export function seriesIntervalLabel(tx: Pick<Transaction, "recurringInterval">): string {
  return tx.recurringInterval === "YEARLY" ? "Yearly" : "Monthly";
}

/**
 * The account(s) the series posts to now, "From → To" for a transfer. Names come from the full
 * account list (archived included), else a root leg; `undefined` while unresolved.
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
