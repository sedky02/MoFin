import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { View } from 'react-native';

import { AccountTypePicker } from '@/components/common/account-type-picker';
import { CurrencyPicker } from '@/components/common/currency-picker';
import { MoneyInput } from '@/components/common/money-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { accountFormSchema, openingBalanceValue, type AccountFormValues } from '@/core/account-form';
import { DASHBOARD_RECENT_LIMIT } from '@/core/dashboard-scope';
import { accountKeys, searchKeys } from '@/core/query-keys';
import { suggestAccountName } from '@/core/onboarding';
import type { Account } from '@/core/types';
import { useCreateAccount } from '@/hooks/useAccounts';
import { guessDeviceCurrency } from '@/lib/device-hints';

function Field({ label, error, description, children }: { label: string; error?: string; description?: string; children: React.ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium">{label}</Text>
      {children}
      {error ? (
        <Text role="alert" className="text-sm text-destructive">
          {error}
        </Text>
      ) : description ? (
        <Text className="text-xs text-muted-foreground">{description}</Text>
      ) : null}
    </View>
  );
}

/**
 * The first account, right on the dashboard. Everything has a default (type, a name for it, the
 * currency of where the device is), so the common case is one tap; the opening balance is optional.
 */
export function FirstAccountForm() {
  const createMut = useCreateAccount();
  const queryClient = useQueryClient();
  const [guess] = React.useState(() => guessDeviceCurrency());
  const [created, setCreated] = React.useState(false);
  // Until the name is edited by hand it follows the type: "Cash wallet", "Savings"...
  const nameEdited = React.useRef(false);
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: { name: suggestAccountName('BANK'), type: 'BANK', currency: guess, openingBalance: '' },
  });
  const currency = useWatch({ control: form.control, name: 'currency' });
  const busy = createMut.isPending || created;

  async function submit() {
    if (busy) return;
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (!valid) return;
    const values = form.getValues();
    try {
      const account = await createMut.mutateAsync({
        name: values.name,
        type: values.type,
        currency: values.currency,
        // Left out when blank: the account starts at 0.
        ...(values.openingBalance.trim() ? { openingBalance: openingBalanceValue(values.openingBalance, values.currency) } : {}),
      });
      // Show the next step now rather than after the list has been fetched again.
      queryClient.setQueryData<Account[]>(accountKeys.list('active'), (old) => [...(old ?? []), account]);
      // Someone with no account has no transactions either: say so, so the next step shows at once.
      queryClient.setQueryData(searchKeys.list({ recent: DASHBOARD_RECENT_LIMIT, accountId: undefined }), []);
      setCreated(true);
    } catch {
      // The hook's onError already said what went wrong.
    }
  }

  return (
    <View accessibilityLabel="Add your first account" className="gap-5">
      <Controller
        control={form.control}
        name="type"
        render={({ field, fieldState }) => (
          <Field label="What kind of account is it?" error={fieldState.error?.message}>
            <AccountTypePicker
              label="What kind of account is it?"
              value={field.value}
              onChange={(type) => {
                field.onChange(type);
                if (!nameEdited.current) form.setValue('name', suggestAccountName(type));
              }}
            />
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="name"
        render={({ field, fieldState }) => (
          <Field label="Name" error={fieldState.error?.message}>
            <Input
              value={field.value}
              accessibilityLabel="Name"
              autoComplete="off"
              className="h-11 sm:h-11"
              onBlur={field.onBlur}
              onChangeText={(t) => {
                nameEdited.current = true;
                field.onChange(t);
              }}
            />
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="currency"
        render={({ field, fieldState }) => (
          <Field
            label="Currency"
            error={fieldState.error?.message}
            description={`${field.value === guess ? 'Picked from where your device is. ' : ''}It can't be changed later.`}>
            <CurrencyPicker value={field.value} onChange={field.onChange} />
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="openingBalance"
        render={({ field, fieldState }) => (
          <Field label="Balance today (optional)" error={fieldState.error?.message} description="What it holds now. It isn't counted as income.">
            <MoneyInput
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              currency={currency}
              allowNegative
              invalid={!!fieldState.error}
              accessibilityLabel="Balance today (optional)"
            />
          </Field>
        )}
      />
      <Button size="lg" disabled={busy} accessibilityLabel={created ? 'Setting up your dashboard' : 'Create account'} onPress={submit}>
        <Text>{created ? 'Setting up your dashboard…' : createMut.isPending ? 'Creating…' : 'Create account'}</Text>
      </Button>
    </View>
  );
}
