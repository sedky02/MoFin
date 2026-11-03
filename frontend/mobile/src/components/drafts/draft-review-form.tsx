import * as React from 'react';
import { View } from 'react-native';

import { MoneyInput } from '@/components/common/money-input';
import { DateTimeField } from '@/components/transactions/datetime-field';
import {
  accountOptions,
  CategoryChips,
  PickerField,
  TypeSwitcher,
} from '@/components/transactions/transaction-form-fields';
import { tidyMoneyText } from '@/components/transactions/transaction-form-model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { handleApiError } from '@/core/form-errors';
import type { TransactionFormValues } from '@/core/transaction-schema';
import type { DraftTransaction, ParsedTransactionData } from '@/core/types';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';

import { buildApproval, initialReviewValues, syncCurrency, withDefaultAccounts, type ReviewErrors } from './draft-model';

function FieldError({ message }: { message?: string }) {
  return message ? (
    <Text role="alert" className="text-sm text-destructive">
      {message}
    </Text>
  ) : null;
}

/** Edit what the assistant understood, then approve it as a transaction. */
export function DraftReviewForm({
  draft,
  approving,
  onApprove,
  onCancel,
}: {
  draft: DraftTransaction;
  approving: boolean;
  onApprove: (edits: Partial<ParsedTransactionData>) => void | Promise<void>;
  onCancel: () => void;
}) {
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const accountList = React.useMemo(() => accounts ?? [], [accounts]);
  const [values, setValues] = React.useState<TransactionFormValues>(() => initialReviewValues(draft, accountList));
  const [errors, setErrors] = React.useState<ReviewErrors>({});

  // Accounts may load after the form opens: fill the empty ones once, like the web's effect.
  const filled = React.useRef(accountList.length > 0);
  React.useEffect(() => {
    if (filled.current || accountList.length === 0) return;
    filled.current = true;
    setValues((v) => withDefaultAccounts(v, accountList));
  }, [accountList]);

  const set = (patch: Partial<TransactionFormValues>) => setValues((v) => syncCurrency({ ...v, ...patch }, accountList));
  const { type } = values;
  const relevantCategories = (categories ?? []).filter((c) => (type === 'TRANSFER' ? false : c.type === type));

  async function submit() {
    if (approving) return;
    const tidy = { ...values, amountRaw: tidyMoneyText(values.amountRaw, values.currency || undefined) };
    setValues(tidy);
    const result = buildApproval(tidy, accountList);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    try {
      await onApprove(result.edits);
    } catch (err) {
      // Backend field errors (e.g. bad account or currency) land on the field the user can fix.
      handleApiError(err, {
        setError: ((name: string, e: { message?: string }) =>
          setErrors((prev) => ({ ...prev, [name]: e.message }))) as never,
      });
    }
  }

  return (
    <View className="gap-4 border-t border-border pt-4" testID="draft-review-form">
      <TypeSwitcher
        value={type}
        onChange={(t) => {
          if (t === type) return;
          // Categories are per type; a kept id would be hidden but still sent.
          set({ type: t, categoryId: undefined });
        }}
      />

      <View className="gap-1.5">
        <Text className="text-sm font-medium">Amount</Text>
        <MoneyInput
          value={values.amountRaw}
          onChange={(v) => set({ amountRaw: v })}
          currency={values.currency || undefined}
          invalid={!!errors.amountRaw}
        />
        <FieldError message={errors.amountRaw} />
      </View>

      <View className="gap-1.5">
        <Text className="text-sm font-medium">Date</Text>
        <DateTimeField
          mode="datetime"
          value={values.occurredAt}
          onChange={(v) => set({ occurredAt: v })}
          accessibilityLabel="Date"
          invalid={!!errors.occurredAt}
        />
        <FieldError message={errors.occurredAt} />
      </View>

      <View className="gap-1.5">
        <Text className="text-sm font-medium">Description</Text>
        <Input
          value={values.description}
          onChangeText={(v) => set({ description: v })}
          accessibilityLabel="Description"
          className={errors.description ? 'h-11 border-destructive sm:h-11' : 'h-11 sm:h-11'}
        />
        <FieldError message={errors.description} />
      </View>

      {type !== 'INCOME' ? (
        <View className="gap-1.5">
          <Text className="text-sm font-medium">{type === 'TRANSFER' ? 'From' : 'Account'}</Text>
          <PickerField
            title={type === 'TRANSFER' ? 'From' : 'Account'}
            accessibilityLabel={type === 'TRANSFER' ? 'From' : 'Account'}
            options={accountOptions(accountList)}
            value={values.fromAccountId}
            onChange={(v) => set({ fromAccountId: v })}
            placeholder="Choose an account"
            invalid={!!errors.fromAccountId}
          />
          <FieldError message={errors.fromAccountId} />
        </View>
      ) : null}
      {type !== 'EXPENSE' ? (
        <View className="gap-1.5">
          <Text className="text-sm font-medium">{type === 'TRANSFER' ? 'To' : 'Account'}</Text>
          <PickerField
            title={type === 'TRANSFER' ? 'To' : 'Account'}
            accessibilityLabel={type === 'TRANSFER' ? 'To' : 'Account'}
            options={accountOptions(accountList)}
            value={values.toAccountId}
            onChange={(v) => set({ toAccountId: v })}
            placeholder="Choose an account"
            invalid={!!errors.toAccountId}
          />
          <FieldError message={errors.toAccountId} />
        </View>
      ) : null}

      {type !== 'TRANSFER' ? (
        <View className="gap-1.5">
          <Text className="text-sm font-medium">
            Category <Text className="font-normal text-muted-foreground">(optional)</Text>
          </Text>
          <CategoryChips categories={relevantCategories} value={values.categoryId} onChange={(id) => set({ categoryId: id })} />
        </View>
      ) : null}

      <View className="flex-row justify-end gap-2">
        <Button variant="ghost" className="min-h-11" onPress={onCancel} accessibilityLabel="Cancel review">
          <Text>Cancel</Text>
        </Button>
        <Button className="min-h-11" disabled={approving} aria-busy={approving} onPress={submit} accessibilityLabel="Approve and record">
          <Text>{approving ? 'Approving…' : 'Approve & record'}</Text>
        </Button>
      </View>
    </View>
  );
}
