import { formatMoneyInput, parseMoneyInput, toDatetimeLocal } from "@/core/format";
import type { UpdateRecurringTransactionInput } from "@/hooks/useTransactions";
import type { Account, Transaction } from "@/core/types";

/**
 * The accounts a series can move to: those in its currency, since every
 * occurrence posts in it, and for a transfer not the account on the other side.
 */
export function seriesAccountOptions(accounts: Account[], currency: string, otherSideId?: string): Account[] {
  return accounts.filter((a) => a.currency === currency && a.id !== otherSideId);
}

export interface RecurringFormValues {
  description: string;
  amountRaw: string;
  categoryId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  recurringInterval: "MONTHLY" | "YEARLY";
  recurringEndDate: string;
}

/** End-of-day in local time, the same instant the new-transaction form stores. */
export function recurringEndDateToIso(date: string): string {
  return new Date(`${date}T23:59:59`).toISOString();
}

/**
 * The edit-series form as the series stands now. The amount keeps the
 * currency's decimals (12.345 TND stays 12.345), and the end date is read in
 * local time, matching how it was saved, so it doesn't show a day late west
 * of UTC.
 */
export function recurringFormValues(tx: Transaction): RecurringFormValues {
  return {
    description: tx.description,
    amountRaw: formatMoneyInput(tx.recurringAmount ?? "0", tx.currency),
    categoryId: tx.categoryId ?? undefined,
    fromAccountId: tx.recurringFromAccountId ?? undefined,
    toAccountId: tx.recurringToAccountId ?? undefined,
    recurringInterval: tx.recurringInterval ?? "MONTHLY",
    recurringEndDate: tx.recurringEndDate ? toDatetimeLocal(tx.recurringEndDate).slice(0, 10) : "",
  };
}

/**
 * PATCH body for the edit-series form: only the fields that differ from what
 * the dialog opened with. Re-sending untouched fields could still change the
 * series (a re-typed amount, an end date shifted by the time zone), and the
 * API keeps anything left out as it is. `amountRaw` must already be valid
 * when it changed.
 */
export function buildRecurringUpdate(
  type: Transaction["type"],
  initial: RecurringFormValues,
  values: RecurringFormValues,
): UpdateRecurringTransactionInput {
  const input: UpdateRecurringTransactionInput = {};
  if (values.description !== initial.description) input.description = values.description;
  if (values.amountRaw !== initial.amountRaw) {
    const amount = parseMoneyInput(values.amountRaw);
    if (amount) input.amount = amount;
  }
  if (values.categoryId !== initial.categoryId) input.categoryId = values.categoryId ?? null;
  if (type !== "INCOME" && values.fromAccountId !== initial.fromAccountId) {
    input.fromAccountId = values.fromAccountId;
  }
  if (type !== "EXPENSE" && values.toAccountId !== initial.toAccountId) {
    input.toAccountId = values.toAccountId;
  }
  if (values.recurringInterval !== initial.recurringInterval) {
    input.recurringInterval = values.recurringInterval;
  }
  if (values.recurringEndDate !== initial.recurringEndDate) {
    input.recurringEndDate = values.recurringEndDate ? recurringEndDateToIso(values.recurringEndDate) : null;
  }
  return input;
}
