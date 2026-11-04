import * as React from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { AccountTypePicker, TYPE_ICON } from '@/components/common/account-type-picker';
import { CurrencyPicker } from '@/components/common/currency-picker';
import { MoneyInput } from '@/components/common/money-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import type { Account } from '@/core/types';
import { useAccounts, useCreateAccount, useUpdateAccount } from '@/hooks/useAccounts';
import { guessDeviceCurrency } from '@/lib/device-hints';

import {
  initialDraft,
  validateAccountDraft,
  withName,
  withType,
  type AccountDraft,
} from './account-form-state';

/** New account / Edit account. Currency is fixed once an account exists. */
function AccountDialogBody({
  open,
  onOpenChange,
  account,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: Account;
  /** After a new account is saved (the dashboard selects it). */
  onCreated?: (account: Account) => void;
}) {
  const isEdit = !!account;
  const createMut = useCreateAccount();
  const updateMut = useUpdateAccount();
  const { data: accounts } = useAccounts();
  const { height } = useWindowDimensions();

  // Currencies already in use, most used first, offered at the top of the picker.
  const usedCurrencies = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of accounts ?? []) counts.set(a.currency, (counts.get(a.currency) ?? 0) + 1);
    return Array.from(counts.keys()).sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  }, [accounts]);

  const [draft, setDraft] = React.useState<AccountDraft>(() => initialDraft(account, guessDeviceCurrency()));
  const [errors, setErrors] = React.useState<Partial<Record<keyof AccountDraft, string>>>({});
  const [pending, setPending] = React.useState(false);


  async function submit() {
    if (pending) return;
    const result = validateAccountDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    const { values, openingBalance } = result;
    setPending(true);
    try {
      if (account) {
        await updateMut.mutateAsync({ id: account.id, name: values.name, type: values.type, openingBalance });
      } else {
        const created = await createMut.mutateAsync({
          name: values.name,
          type: values.type,
          currency: values.currency,
          // Left out when blank: the account starts at 0.
          ...(values.openingBalance.trim() ? { openingBalance } : {}),
        });
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch {
      // The hook already showed the error toast.
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md" style={{ maxHeight: height - 32 }}>
        <DialogHeader className="flex-row items-center gap-3 border-b border-border px-4 py-3 pr-12">
          <View aria-hidden className="size-10 items-center justify-center rounded-xl bg-secondary">
            <Icon as={TYPE_ICON[draft.type]} size={20} className="text-muted-foreground" />
          </View>
          <View className="min-w-0 flex-1">
            <DialogTitle>{isEdit ? 'Edit account' : 'New account'}</DialogTitle>
            <DialogDescription className="mt-1">
              {isEdit
                ? "Update this account's name, type or opening balance."
                : 'Add an account to track its balance via the ledger.'}
            </DialogDescription>
          </View>
        </DialogHeader>

        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerClassName="gap-4 px-4 py-4">
          <View className="gap-1.5">
            <Text className="text-sm font-medium">Name</Text>
            <Input
              value={draft.name}
              onChangeText={(v) => setDraft((d) => withName(d, v))}
              placeholder="e.g. Everyday checking"
              autoComplete="off"
              accessibilityLabel="Name"
              returnKeyType="done"
              className={errors.name ? 'min-h-11 border-destructive' : 'min-h-11'}
            />
            {errors.name ? (
              <Text role="alert" className="text-sm text-destructive">
                {errors.name}
              </Text>
            ) : null}
          </View>

          <View className="gap-1.5">
            <Text className="text-sm font-medium">Type</Text>
            <AccountTypePicker value={draft.type} onChange={(t) => setDraft((d) => withType(d, t))} />
          </View>

          <View className="gap-1.5">
            <Text className="text-sm font-medium">Currency</Text>
            <CurrencyPicker
              value={draft.currency}
              onChange={(c) => setDraft((d) => ({ ...d, currency: c }))}
              pinned={usedCurrencies}
              disabled={isEdit}
            />
            {isEdit ? (
              <Text className="text-xs text-muted-foreground">Currency can&apos;t be changed after an account is created.</Text>
            ) : null}
            {errors.currency ? (
              <Text role="alert" className="text-sm text-destructive">
                {errors.currency}
              </Text>
            ) : null}
          </View>

          <View className="gap-1.5">
            <Text className="text-sm font-medium">Opening balance (optional)</Text>
            <MoneyInput
              value={draft.openingBalance}
              onChange={(v) => setDraft((d) => ({ ...d, openingBalance: v }))}
              currency={draft.currency}
              allowNegative
              invalid={!!errors.openingBalance}
              accessibilityLabel="Opening balance"
            />
            <Text className="text-xs text-muted-foreground">
              What the account held before you started tracking it. It isn&apos;t counted as income. Use a minus for money owed.
            </Text>
            {errors.openingBalance ? (
              <Text role="alert" className="text-sm text-destructive">
                {errors.openingBalance}
              </Text>
            ) : null}
          </View>
        </ScrollView>

        <View className="flex-row justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="ghost" className="min-h-11" onPress={() => onOpenChange(false)} accessibilityLabel="Cancel">
            <Text>Cancel</Text>
          </Button>
          <Button className="min-h-11" disabled={pending} aria-busy={pending} onPress={submit}>
            <Text>{pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create account'}</Text>
          </Button>
        </View>
      </DialogContent>
    </Dialog>
  );
}

/** Mounts the form only while open, so every opening starts from fresh state. */
export function AccountDialog(props: React.ComponentProps<typeof AccountDialogBody>) {
  return props.open ? <AccountDialogBody {...props} /> : null;
}
