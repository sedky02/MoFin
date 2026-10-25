"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/common/submit-button";
import { MoneyInput } from "@/components/common/money-input";
import { ACCOUNT_TYPES, CURRENCIES } from "@/lib/constants";
import { formatMoneyInput, normalizeSignedMoneyTyping } from "@/lib/format";
import { tryParse } from "@/lib/decimal";
import {
  useAccounts,
  useCreateAccount,
  useUpdateAccount,
} from "@/hooks/useAccounts";
import type { Account } from "@/lib/types";

const schema = z.object({
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
type Values = z.infer<typeof schema>;

/** The opening balance to send: blank is 0, otherwise rounded to the currency's decimals. */
function openingBalanceValue(raw: string, currency: string): string {
  const normalized = raw.trim() === "" ? null : normalizeSignedMoneyTyping(raw);
  return normalized === null ? "0" : formatMoneyInput(normalized, currency);
}

/** What the field starts with: blank for 0, so a new or untouched account shows the placeholder. */
function openingBalanceDefault(account?: Account): string {
  const d = tryParse(account?.openingBalance ?? "0");
  return !d || d.isZero() ? "" : formatMoneyInput(d.toString(), account?.currency);
}

export function AccountDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: Account; // present → edit mode
}) {
  const isEdit = !!account;
  const createMut = useCreateAccount();
  const updateMut = useUpdateAccount();
  const { data: accounts } = useAccounts();

  // Currencies already in use across the user's accounts, surfaced as a
  // quick-pick section at the top of the picker. Ordered by frequency.
  const usedCurrencies = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of accounts ?? []) {
      if (a.currency) counts.set(a.currency, (counts.get(a.currency) ?? 0) + 1);
    }
    return Array.from(counts.keys()).sort(
      (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0),
    );
  }, [accounts]);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: account?.name ?? "",
      type: account?.type ?? "BANK",
      currency: account?.currency ?? "USD",
      openingBalance: openingBalanceDefault(account),
    },
  });
  const currency = useWatch({ control: form.control, name: "currency" });

  // Reset whenever we open with a (possibly different) account.
  React.useEffect(() => {
    if (open) {
      form.reset({
        name: account?.name ?? "",
        type: account?.type ?? "BANK",
        currency: account?.currency ?? "USD",
        openingBalance: openingBalanceDefault(account),
      });
    }
  }, [open, account, form]);

  async function action() {
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (!valid) return;
    const values = form.getValues();
    const openingBalance = openingBalanceValue(values.openingBalance, values.currency);
    try {
      if (isEdit) {
        await updateMut.mutateAsync({
          id: account.id,
          name: values.name,
          type: values.type,
          openingBalance,
        });
      } else {
        await createMut.mutateAsync({
          name: values.name,
          type: values.type,
          currency: values.currency,
          // Left out when blank: the account starts at 0.
          ...(values.openingBalance.trim() ? { openingBalance } : {}),
        });
      }
      onOpenChange(false);
    } catch {
      // handled by hook's onError toast / setError not needed here
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit account" : "New account"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this account's name, type or opening balance."
              : "Add an account to track its balance via the ledger."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form action={action} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Everyday checking" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isEdit && (
                    <FormDescription>
                      Currency can&apos;t be changed after an account is created.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isEdit} // currency is fixed after creation
                  >
                    <FormControl>
                      <SelectTrigger className="w-full tabular">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {usedCurrencies.length > 0 && (
                        <>
                          <SelectGroup>
                            <SelectLabel>In use</SelectLabel>
                            {usedCurrencies.map((c) => (
                              <SelectItem
                                key={`used-${c}`}
                                value={c}
                                className="tabular"
                              >
                                {c}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                          <SelectSeparator />
                        </>
                      )}
                      <SelectGroup>
                        <SelectLabel>All currencies</SelectLabel>
                        {CURRENCIES.filter((c) => !usedCurrencies.includes(c)).map((c) => (
                          <SelectItem key={c} value={c} className="tabular">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="openingBalance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Opening balance (optional)</FormLabel>
                  <FormControl>
                    <MoneyInput
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      currency={currency}
                      allowNegative
                    />
                  </FormControl>
                  <FormDescription>
                    What the account held before you started tracking it. It
                    isn&apos;t counted as income. Use a minus for money owed.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <SubmitButton pendingText="Saving…">
                {isEdit ? "Save changes" : "Create account"}
              </SubmitButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
