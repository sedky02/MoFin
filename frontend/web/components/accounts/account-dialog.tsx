"use client";

import { FormLabelWithHint } from "@/components/common/form-label-hint";
import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AccountTypePicker } from "@/components/accounts/account-type-picker";
import { SubmitButton } from "@/components/common/submit-button";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { MoneyInput } from "@/components/common/money-input";
import { accountFormSchema, openingBalanceValue, type AccountFormValues } from "@/lib/account-form";
import { formatMoneyInput } from "@/lib/format";
import { guessCurrency } from "@/lib/onboarding";
import { tryParse } from "@/lib/decimal";
import {
  useAccounts,
  useCreateAccount,
  useUpdateAccount,
} from "@/hooks/useAccounts";
import type { Account } from "@/lib/types";

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

  // Currencies in use across the user's accounts, ordered by frequency, as a quick-pick at the top.
  const usedCurrencies = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of accounts ?? []) {
      if (a.currency) counts.set(a.currency, (counts.get(a.currency) ?? 0) + 1);
    }
    return Array.from(counts.keys()).sort(
      (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0),
    );
  }, [accounts]);

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      name: account?.name ?? "",
      type: account?.type ?? "BANK",
      currency: account?.currency ?? "USD",
      openingBalance: openingBalanceDefault(account),
    },
  });
  const currency = useWatch({ control: form.control, name: "currency" });
  const nameRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (open) {
      form.reset({
        name: account?.name ?? "",
        type: account?.type ?? "BANK",
        // A new account starts in the currency of where the device is, not always USD.
        currency: account?.currency ?? guessCurrency(),
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
          ...(values.openingBalance.trim() ? { openingBalance } : {}),
        });
      }
      onOpenChange(false);
    } catch {
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Header and footer stay put; only the form body scrolls, so a short screen never clips the buttons.
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md sm:p-0"
        showCloseButton={false}
        // The name is the one thing everyone fills in, so the cursor starts there.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          nameRef.current?.focus();
        }}
      >
        <DialogHeader className="flex-row items-center gap-3 border-b px-5 py-3.5 sm:px-6 sm:py-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate">{isEdit ? "Edit account" : "New account"}</DialogTitle>
            <DialogDescription className="sr-only">
              {isEdit
                ? "Update this account's name, type or opening balance."
                : "Add an account to track its balance via the ledger."}
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="-mr-2 shrink-0 text-muted-foreground">
              <X aria-hidden />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        </DialogHeader>

        <Form {...form}>
          <form action={action} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
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
                    <AccountTypePicker value={field.value} onChange={field.onChange} />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    {isEdit ? (
                      <FormLabelWithHint hintLabel="About the currency" hint="Currency can't be changed after an account is created.">
                        Currency
                      </FormLabelWithHint>
                    ) : (
                      <FormLabel>Currency</FormLabel>
                    )}
                    <FormControl>
                      <CurrencyPicker
                        value={field.value}
                        onChange={field.onChange}
                        pinned={usedCurrencies}
                        disabled={isEdit} // currency is fixed after creation
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="openingBalance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabelWithHint
                      hintLabel="About the opening balance"
                      hint="What the account held before you started tracking it. It isn't counted as income. Use a minus for money owed."
                    >
                      Opening balance (optional)
                    </FormLabelWithHint>
                    <FormControl>
                      <MoneyInput
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        currency={currency}
                        allowNegative
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="m-0 flex-row justify-end gap-2 rounded-none border-t px-5 py-3.5 sm:m-0 sm:gap-2 sm:px-6 sm:py-4">
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
