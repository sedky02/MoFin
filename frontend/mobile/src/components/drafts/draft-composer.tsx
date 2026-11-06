import * as React from 'react';
import { View } from 'react-native';

import { accountOptions, PickerField } from '@/components/transactions/transaction-form-fields';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import { useAccounts } from '@/hooks/useAccounts';
import { writableAccounts } from '@/core/account-sharing';
import { useActiveAccount } from '@/hooks/useActiveAccount';
import { useCreateDraftIntent } from '@/hooks/useDrafts';
import { Sparkles } from '@/lib/icons';

export function DraftComposer({ autoFocus = false }: { autoFocus?: boolean } = {}) {
  const [input, setInput] = React.useState('');
  const { accountId: activeAccountId } = useActiveAccount();
  // An explicit pick here overrides the app-wide active account for this composer only.
  const [pickedAccountId, setPickedAccountId] = React.useState<string | undefined>();
  const defaultAccountId = pickedAccountId ?? activeAccountId;
  const { data: allAccounts } = useAccounts();
  const accounts = writableAccounts(allAccounts ?? []);
  const createIntent = useCreateDraftIntent();

  async function submit() {
    const text = input.trim();
    if (!text || createIntent.isPending) return;
    const account = accounts.find((a) => a.id === defaultAccountId);
    try {
      await createIntent.mutateAsync({ input: text, defaultAccountId, defaultCurrency: account?.currency });
      setInput('');
    } catch {
      /* the hook toasts */
    }
  }

  return (
    <View>
      <View className="gap-3 rounded-2xl border border-border bg-card p-3">
        <Textarea
          value={input}
          onChangeText={setInput}
          placeholder="Describe a transaction, e.g. Spent 42.50 on groceries yesterday"
          numberOfLines={3}
          className="min-h-20 border-0 bg-transparent px-1 shadow-none dark:bg-transparent"
          accessibilityLabel="Describe a transaction in plain language"
          autoFocus={autoFocus}
        />
        <PickerField
          title="Default account"
          accessibilityLabel="Default account"
          options={accountOptions(accounts)}
          value={defaultAccountId}
          onChange={setPickedAccountId}
          placeholder="Account (optional)"
        />
        <Button
          onPress={submit}
          disabled={!input.trim() || createIntent.isPending}
          aria-busy={createIntent.isPending}
          className="min-h-11 gap-2"
          accessibilityLabel="Draft it">
          <Icon as={Sparkles} size={16} className="text-primary-foreground" />
          <Text>{createIntent.isPending ? 'Parsing…' : 'Draft it'}</Text>
        </Button>
      </View>
    </View>
  );
}
