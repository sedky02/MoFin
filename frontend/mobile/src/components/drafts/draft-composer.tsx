import * as React from 'react';
import { Pressable, View } from 'react-native';

import { accountOptions, PickerField } from '@/components/transactions/transaction-form-fields';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import { useAccounts } from '@/hooks/useAccounts';
import { useActiveAccount } from '@/hooks/useActiveAccount';
import { useCreateDraftIntent } from '@/hooks/useDrafts';
import { CornerDownRight, Sparkles } from '@/lib/icons';

import { EXAMPLES } from './draft-model';

/** One text box: the sentence, an optional default account and the "Draft it" button. */
/** `autoFocus`: open with the keyboard up (arriving from the add sheet's "Describe it"). */
export function DraftComposer({ autoFocus = false }: { autoFocus?: boolean } = {}) {
  const [input, setInput] = React.useState('');
  const { accountId: activeAccountId } = useActiveAccount();
  // An explicit pick here overrides the app-wide active account for this composer only.
  const [pickedAccountId, setPickedAccountId] = React.useState<string | undefined>();
  const defaultAccountId = pickedAccountId ?? activeAccountId;
  const { data: accounts } = useAccounts();
  const createIntent = useCreateDraftIntent();

  async function submit() {
    const text = input.trim();
    if (!text || createIntent.isPending) return;
    const account = accounts?.find((a) => a.id === defaultAccountId);
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
          options={accountOptions(accounts ?? [])}
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

      {/* Tapping an example fills the box, so the first try is one tap away. */}
      <Text className="mb-2 mt-4 px-1 text-sm font-semibold text-muted-foreground">Try one</Text>
      <View accessibilityLabel="Examples" className="flex-row flex-wrap gap-2">
        {EXAMPLES.map((text) => (
          <Pressable
            key={text}
            role="button"
            accessibilityLabel={`Use example: ${text}`}
            onPress={() => setInput(text)}
            className="min-h-10 max-w-full flex-row items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 active:bg-accent">
            <Icon as={CornerDownRight} size={14} aria-hidden className="text-muted-foreground" />
            <Text numberOfLines={1} className="shrink text-sm">
              {text}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
