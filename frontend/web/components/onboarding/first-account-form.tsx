"use client";

import { FormLabelWithHint } from "@/components/common/form-label-hint";
import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { AccountTypePicker } from "@/components/accounts/account-type-picker";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { MoneyInput } from "@/components/common/money-input";
import { SubmitButton } from "@/components/common/submit-button";
import { useCreateAccount } from "@/hooks/useAccounts";
import { accountFormSchema, openingBalanceValue, type AccountFormValues } from "@/lib/account-form";
import { guessCurrency, suggestAccountName } from "@/lib/onboarding";
import { DASHBOARD_RECENT_LIMIT } from "@/lib/dashboard-scope";
import { accountKeys, searchKeys } from "@/lib/query-keys";
import type { Account } from "@/lib/types";

/**
 * The first account on the dashboard, with a default for everything (type, name, the device's
 * currency), so the common case is one tap.
 */
export function FirstAccountForm() {
  const createMut = useCreateAccount();
  const queryClient = useQueryClient();
  const [guess] = React.useState(() => guessCurrency());
  const [created, setCreated] = React.useState(false);
  // Until the name is edited by hand it follows the type: "Cash wallet", "Savings"…
  const nameEdited = React.useRef(false);

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: { name: suggestAccountName("BANK"), type: "BANK", currency: guess, openingBalance: "" },
  });
  const currency = useWatch({ control: form.control, name: "currency" });

  async function action() {
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (!valid) return;
    const values = form.getValues();
    try {
      const account = await createMut.mutateAsync({
        name: values.name,
        type: values.type,
        currency: values.currency,
        ...(values.openingBalance.trim()
          ? { openingBalance: openingBalanceValue(values.openingBalance, values.currency) }
          : {}),
      });
      // Show the dashboard now rather than after the list has been fetched again.
      queryClient.setQueryData<Account[]>(accountKeys.list("active"), (old) => [...(old ?? []), account]);
      // Someone with no account has no transactions either: say so, so the next step shows at once.
      queryClient.setQueryData(searchKeys.list({ recent: DASHBOARD_RECENT_LIMIT, accountId: undefined }), []);
      setCreated(true);
    } catch {
      // The hook's onError already said what went wrong.
    }
  }

  return (
    <Form {...form}>
      <form action={action} className="space-y-5" aria-label="Add your first account">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>What kind of account is it?</FormLabel>
              <AccountTypePicker
                value={field.value}
                onChange={(type) => {
                  field.onChange(type);
                  if (!nameEdited.current) form.setValue("name", suggestAccountName(type));
                }}
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  autoComplete="off"
                  {...field}
                  onChange={(e) => {
                    nameEdited.current = true;
                    field.onChange(e);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabelWithHint
                  hintLabel="About the currency"
                  hint={`${field.value === guess ? "Picked from where your device is. " : ""}It can't be changed later.`}
                >
                  Currency
                </FormLabelWithHint>
                <FormControl>
                  <CurrencyPicker value={field.value} onChange={field.onChange} />
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
                <FormLabelWithHint hintLabel="About the balance" hint="What it holds now. It isn't counted as income.">
                  Balance today (optional)
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

        <SubmitButton className="w-full sm:w-auto" pendingText="Creating…" disabled={created}>
          {created ? "Setting up your dashboard…" : "Create account"}
        </SubmitButton>
      </form>
    </Form>
  );
}
