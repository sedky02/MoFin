import { formatMoneyInput } from "@/core/format";
import type { ParsedTransactionData } from "@/core/types";

export function draftAmountInput(p: Pick<ParsedTransactionData, "amount" | "currency">): string {
  return p.amount ? formatMoneyInput(p.amount, p.currency) : "";
}
