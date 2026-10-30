"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X } from "lucide-react";
import {
  Dialog,
  DialogClose,
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
import { Button } from "@/components/ui/button";
import { TYPE_ICON } from "@/components/accounts/account-card";
import { cn } from "@/lib/utils";
import { SubmitButton } from "@/components/common/submit-button";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { MoneyInput } from "@/components/common/money-input";
import { ACCOUNT_TYPES } from "@/lib/constants";
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
  const type = useWatch({ control: form.control, name: "type" });
  const nameRef = React.useRef<HTMLInputElement | null>(null);
  const TypeIcon = TYPE_ICON[type];

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
      <DialogContent
        // Header and footer stay put; only the form body scrolls, so a short screen never clips the buttons.
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        showCloseButton={false}
        // The name is the one thing everyone fills in, so the cursor starts there.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          nameRef.current?.focus();
        }}
      >
        <DialogHeader className="flex-row items-center gap-3 border-b px-4 py-3 sm:gap-3.5 sm:px-6 sm:py-4">
          {/* How the account will look in the list, updating as you choose. */}
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground sm:size-12"
          >
            <TypeIcon className="size-5 sm:size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base sm:text-lg">
              {isEdit ? "Edit account" : "New account"}
            </DialogTitle>
            <DialogDescription className="mt-1 max-sm:hidden">
              {isEdit
                ? "Update this account's name, type or opening balance."
                : "Add an account to track its balance via the ledger."}
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground">
              <X aria-hidden />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        </DialogHeader>

        <Form {...form}>
          <form action={action} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:space-y-5 sm:px-6 sm:py-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Everyday checking"
                        autoComplete="off"
                        {...field}
                        ref={(el) => {
                          field.ref(el);
                          nameRef.current = el;
                        }}
                      />
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
                    <div role="group" aria-label="Type" className="grid grid-cols-4 gap-2">
                      {ACCOUNT_TYPES.map((t) => {
                        const Icon = TYPE_ICON[t.value];
                        const selected = field.value === t.value;
                        return (
                          <button
                            key={t.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => field.onChange(t.value)}
                            className={cn(
                              "flex flex-col items-center gap-1.5 rounded-lg bg-card px-2 py-2.5 text-xs font-medium transition-shadow",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              selected
                                ? "text-foreground ring-2 ring-primary"
                                : "text-muted-foreground ring-1 ring-border hover:text-foreground hover:ring-foreground/30",
                            )}
                          >
                            <Icon className="size-5" aria-hidden />
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
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
                    <FormControl>
                      <CurrencyPicker
                        value={field.value}
                        onChange={field.onChange}
                        pinned={usedCurrencies}
                        disabled={isEdit} // currency is fixed after creation
                      />
                    </FormControl>
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
            </div>

            <DialogFooter className="m-0 flex-row justify-end gap-2 border-t px-4 py-3 sm:gap-2 sm:px-6 sm:py-4">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
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
