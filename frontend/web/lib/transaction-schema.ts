import { z } from "zod";
import type { Account } from "@/lib/types";
import { parseMoneyInput, validateAccountCurrency } from "@/lib/format";

export const transactionItemSchema = z.object({
  amountRaw: z.string(),
  categoryId: z.string().optional(),
  description: z.string().trim().max(140).optional(),
});

export const transactionFormBase = z.object({
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  description: z.string().trim().min(1, "Add a short description.").max(140),
  amountRaw: z.string(),
  currency: z.string().min(1, "Currency is required."),
  fromAccountId: z.string().optional(),
  toAccountId: z.string().optional(),
  categoryId: z.string().optional(),
  occurredAt: z.string().min(1, "Pick a date."),
  // Present (length >= 2) when the transaction is split across multiple items;
  // absent/single means the plain, unsplit form below still applies.
  items: z.array(transactionItemSchema).optional(),
  isRecurring: z.boolean().optional(),
  recurringInterval: z.enum(["MONTHLY", "YEARLY"]).optional(),
  recurringEndDate: z.string().optional(),
});

export type TransactionFormValues = z.infer<typeof transactionFormBase>;

export function makeTransactionSchema(accounts: Account[]) {
  const byId = new Map(accounts.map((a) => [a.id, a]));

  return transactionFormBase.superRefine((val, ctx) => {
    if (!parseMoneyInput(val.amountRaw)) {
      ctx.addIssue({
        path: ["amountRaw"],
        code: z.ZodIssueCode.custom,
        message: "Enter an amount greater than 0.",
      });
    }

    if (val.type === "INCOME") {
      if (!val.toAccountId) {
        ctx.addIssue({
          path: ["toAccountId"],
          code: z.ZodIssueCode.custom,
          message: "Choose the account receiving the income.",
        });
      }
    } else if (val.type === "EXPENSE") {
      if (!val.fromAccountId) {
        ctx.addIssue({
          path: ["fromAccountId"],
          code: z.ZodIssueCode.custom,
          message: "Choose the account the expense came from.",
        });
      }
    } else {
      if (!val.fromAccountId) {
        ctx.addIssue({
          path: ["fromAccountId"],
          code: z.ZodIssueCode.custom,
          message: "Choose the source account.",
        });
      }
      if (!val.toAccountId) {
        ctx.addIssue({
          path: ["toAccountId"],
          code: z.ZodIssueCode.custom,
          message: "Choose the destination account.",
        });
      }
      if (val.fromAccountId && val.toAccountId) {
        if (val.fromAccountId === val.toAccountId) {
          ctx.addIssue({
            path: ["toAccountId"],
            code: z.ZodIssueCode.custom,
            message: "Source and destination must differ.",
          });
        } else {
          const from = byId.get(val.fromAccountId);
          const to = byId.get(val.toAccountId);
          if (from && to && from.currency !== to.currency) {
            ctx.addIssue({
              path: ["toAccountId"],
              code: z.ZodIssueCode.custom,
              message: `Cross-currency transfers aren't supported (${from.currency} → ${to.currency}).`,
            });
          }
        }
      }
    }

    const acct =
      val.type === "INCOME"
        ? byId.get(val.toAccountId ?? "")
        : byId.get(val.fromAccountId ?? "");
    if (acct && !validateAccountCurrency(acct, val.currency)) {
      ctx.addIssue({
        path: ["amountRaw"],
        code: z.ZodIssueCode.custom,
        message: `Amount must be in ${acct.currency}.`,
      });
    }

    // Split items only matter for INCOME/EXPENSE with more than one row; the total is derived from
    // them.
    if (val.items && val.items.length > 1) {
      if (val.type === "TRANSFER") {
        ctx.addIssue({
          path: ["items"],
          code: z.ZodIssueCode.custom,
          message: "Transfers can't be split into multiple items.",
        });
      } else {
        val.items.forEach((item, i) => {
          if (!parseMoneyInput(item.amountRaw)) {
            ctx.addIssue({
              path: ["items", i, "amountRaw"],
              code: z.ZodIssueCode.custom,
              message: "Enter an amount greater than 0.",
            });
          }
        });
      }
    }

    // Recurring transactions can't be split, and need an interval.
    if (val.isRecurring) {
      if (val.items && val.items.length > 1) {
        ctx.addIssue({
          path: ["isRecurring"],
          code: z.ZodIssueCode.custom,
          message: "Recurring transactions can't be split into multiple items.",
        });
      }
      if (!val.recurringInterval) {
        ctx.addIssue({
          path: ["recurringInterval"],
          code: z.ZodIssueCode.custom,
          message: "Choose how often this repeats.",
        });
      }
      if (
        val.recurringEndDate &&
        val.occurredAt &&
        new Date(`${val.recurringEndDate}T23:59:59`) <= new Date(val.occurredAt)
      ) {
        ctx.addIssue({
          path: ["recurringEndDate"],
          code: z.ZodIssueCode.custom,
          message: "End date must be after the transaction date.",
        });
      }
    }
  });
}
