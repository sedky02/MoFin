import { formatMoneyInput } from "@/lib/format";
import type { ParsedTransactionData } from "@/lib/types";

export function draftAmountInput(p: Pick<ParsedTransactionData, "amount" | "currency">): string {
  return p.amount ? formatMoneyInput(p.amount, p.currency) : "";
}
