import * as React from 'react';
import { Pressable, View } from 'react-native';

import { MoneyInput } from '@/components/common/money-input';
import { DateTimeField } from '@/components/transactions/datetime-field';
import {
  accountOptions,
  categoryOptions,
  CategoryChips,
  PickerField,
  TypeSwitcher,
} from '@/components/transactions/transaction-form-fields';
import { splitItemsTotal, tidyMoneyText } from '@/components/transactions/transaction-form-model';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { handleApiError } from '@/core/form-errors';
import type { TransactionFormValues } from '@/core/transaction-schema';
import type { DraftTransaction, ParsedTransactionData } from '@/core/types';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { Plus, Trash2 } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { categoryScope, sameOwnerAccounts, writableAccounts } from '@/core/account-sharing';

import { buildApproval, initialReviewValues, syncCurrency, withDefaultAccounts, type ReviewErrors } from './draft-model';

function FieldError({ message }: { message?: string }) {
  return message ? (
    <Text role="alert" className="text-sm text-destructive">
      {message}
    </Text>
  ) : null;
}

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
  const accountList = React.useMemo(() => writableAccounts(accounts ?? []), [accounts]);
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
  const items = values.items ?? [];
  const splitting = type !== 'TRANSFER' && items.length > 1;
  const setItems = (next: typeof items) => setValues((v) => ({ ...v, items: next }));
  const setItem = (index: number, patch: Partial<(typeof items)[number]>) =>
    setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  // A shared account uses its owner's categories, so moving the draft can drop the pick.
  const ledgerAccountId = type === 'INCOME' ? values.toAccountId : values.fromAccountId;
  const categorySet = categoryScope(accountList.find((a) => a.id === ledgerAccountId));
  const { data: categories } = useCategories('active', true, categorySet);
  const previousCategorySet = React.useRef(categorySet);
  React.useEffect(() => {
    if (!accountList.length || previousCategorySet.current === categorySet) return;
    previousCategorySet.current = categorySet;
    setValues((v) => ({
      ...v,
      categoryId: undefined,
      items: v.items?.map((item) => ({ ...item, categoryId: undefined })),
    }));
  }, [categorySet, accountList.length]);
  const relevantCategories = (categories ?? []).filter((c) => (type === 'TRANSFER' ? false : c.type === type));

  async function submit() {
    if (approving) return;
    const currency = values.currency || undefined;
    const tidyItems = items.map((item) => ({ ...item, amountRaw: tidyMoneyText(item.amountRaw, currency) }));
    const tidy = {
      ...values,
      items: tidyItems,
      amountRaw: splitting ? splitItemsTotal(tidyItems, currency) : tidyMoneyText(values.amountRaw, currency),
    };
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
          set({ type: t, categoryId: undefined, items: t === 'TRANSFER' ? [] : items.map((item) => ({ ...item, categoryId: undefined })) });
        }}
      />

      <View className="gap-1.5">
        <Text className="text-sm font-medium">Amount</Text>
        <MoneyInput
          value={splitting ? splitItemsTotal(items, values.currency) : values.amountRaw}
          onChange={(v) => set({ amountRaw: v })}
          currency={values.currency || undefined}
          invalid={!!errors.amountRaw}
          disabled={splitting}
        />
        {splitting ? <Text className="text-xs text-muted-foreground">Calculated from the items below.</Text> : null}
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
          className={errors.description ? 'min-h-11 border-destructive' : 'min-h-11'}
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
            options={accountOptions(type === 'TRANSFER' ? sameOwnerAccounts(accountList, accountList.find((a) => a.id === values.fromAccountId)) : accountList)}
            value={values.toAccountId}
            onChange={(v) => set({ toAccountId: v })}
            placeholder="Choose an account"
            invalid={!!errors.toAccountId}
          />
          <FieldError message={errors.toAccountId} />
        </View>
      ) : null}

      {splitting ? (
        <View className="gap-3 rounded-2xl bg-muted/50 p-4" testID="draft-split-items">
          <Text role="heading" aria-level={2} className="text-sm font-medium">
            Split into {items.length} items
          </Text>
          {items.map((item, i) => (
            <View key={i} className="gap-2">
              <View className="flex-row items-start gap-2">
                <View className="min-w-0 flex-1">
                  <MoneyInput
                    value={item.amountRaw}
                    onChange={(v) => setItem(i, { amountRaw: v })}
                    currency={values.currency || undefined}
                    accessibilityLabel={`Item ${i + 1} amount`}
                    testID={`item-${i}-amount`}
                  />
                </View>
                <Pressable
                  role="button"
                  accessibilityLabel={`Remove item ${i + 1}`}
                  accessibilityState={{ disabled: items.length <= 2 }}
                  disabled={items.length <= 2}
                  onPress={() => setItems(items.filter((_, index) => index !== i))}
                  className={cn('size-11 items-center justify-center rounded-md active:bg-accent', items.length <= 2 && 'opacity-40')}>
                  <Icon as={Trash2} size={16} aria-hidden className="text-muted-foreground" />
                </Pressable>
              </View>
              <PickerField
                title="Category"
                accessibilityLabel={`Item ${i + 1} category`}
                options={categoryOptions(relevantCategories)}
                value={item.categoryId || undefined}
                onChange={(v) => setItem(i, { categoryId: v })}
                placeholder="Uncategorized"
                emptyOption="Uncategorized"
                className="min-h-11 rounded-md border border-input bg-background dark:bg-input/30"
              />
              <Input
                value={item.description ?? ''}
                onChangeText={(v) => setItem(i, { description: v })}
                placeholder="Item description (optional)"
                accessibilityLabel={`Item ${i + 1} note`}
                maxLength={140}
                className="min-h-11 text-sm"
              />
            </View>
          ))}
          <Pressable
            role="button"
            accessibilityLabel="Add item"
            onPress={() => setItems([...items, { amountRaw: '', categoryId: undefined, description: '' }])}
            className="min-h-11 flex-row items-center gap-1.5 self-start px-1 active:opacity-70">
            <Icon as={Plus} size={16} aria-hidden className="text-primary-text" />
            <Text className="text-xs font-medium text-primary-text">Add item</Text>
          </Pressable>
        </View>
      ) : null}

      {type !== 'TRANSFER' && !splitting ? (
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
