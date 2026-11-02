// What an account form checks and sends, shared by the New account dialog and the first-run
// form, so both read an opening balance the same way.
import { z } from "zod";
import { formatMoneyInput, normalizeSignedMoneyTyping } from "@/core/format";

export const accountFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(60),
  type: z.enum(["CASH", "BANK", "SAVINGS", "CRYPTO"]),
  currency: z.string().trim().min(2, "Select a currency.").max(10),
  // Optional and may be negative (money owed on a card). Blank means 0.
  openingBalance: z
    .string()
    .refine(
      (v) => v.trim() === "" || normalizeSignedMoneyTyping(v) !== null,
      "Enter an amount, like 5000 or -250.",
    ),
});
export type AccountFormValues = z.infer<typeof accountFormSchema>;

/** The opening balance to send: blank is 0, otherwise rounded to the currency's decimals. */
export function openingBalanceValue(raw: string, currency: string): string {
  const normalized = raw.trim() === "" ? null : normalizeSignedMoneyTyping(raw);
  return normalized === null ? "0" : formatMoneyInput(normalized, currency);
}
