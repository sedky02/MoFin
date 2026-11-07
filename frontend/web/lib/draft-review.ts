import { formatMoneyInput, parseMoneyInput } from "@/lib/format";
import type { ParsedTransactionData } from "@/lib/types";

export function draftAmountInput(p: Pick<ParsedTransactionData, "amount" | "currency">): string {
  return p.amount ? formatMoneyInput(p.amount, p.currency) : "";
}

export interface DraftItemFormValue {
  amountRaw: string;
  categoryId?: string;
  description?: string;
}

/** A draft with fewer than two lines is the plain unsplit form. */
export function draftItemFormValues(
  p: Pick<ParsedTransactionData, "items" | "currency">,
): DraftItemFormValue[] {
  if (!p.items || p.items.length < 2) return [];
  return p.items.map((item) => ({
    amountRaw: formatMoneyInput(item.amount, p.currency),
    categoryId: item.categoryId ?? undefined,
    description: item.memo ?? "",
  }));
}

export function draftItemsPayload(items: DraftItemFormValue[] | undefined) {
  if (!items || items.length < 2) return undefined;
  return items.map((item) => ({
    amount: parseMoneyInput(item.amountRaw) ?? "0",
    categoryId: item.categoryId || undefined,
    memo: item.description?.trim() || undefined,
  }));
}
