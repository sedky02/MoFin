import { formatMoneyInput } from "@/core/format";
import type { ParsedTransactionData } from "@/core/types";

/** Initial amount field for a draft review, rounded to the draft currency's minor units. */
export function draftAmountInput(p: Pick<ParsedTransactionData, "amount" | "currency">): string {
  return p.amount ? formatMoneyInput(p.amount, p.currency) : "";
}
