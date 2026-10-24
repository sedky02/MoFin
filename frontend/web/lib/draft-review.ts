import { formatMoneyInput } from "@/lib/format";
import type { ParsedTransactionData } from "@/lib/types";

/** Initial amount field for a draft review, rounded to the draft currency's minor units. */
export function draftAmountInput(p: Pick<ParsedTransactionData, "amount" | "currency">): string {
  return p.amount ? formatMoneyInput(p.amount, p.currency) : "";
}
