/**
 * TransactionForm: records a new expense, income or transfer, or edits a saved one. The phone
 * version of frontend/web/components/transactions/transaction-form.tsx, with the same schema
 * (src/core/transaction-schema), messages, rounding and payload (transaction-form-model.ts).
 *
 * Props
 * - `mode`: 'create' (default) or 'edit'.
 * - `transactionId`: edit mode, the transaction to load (GET /transactions/:id).
 * - `transaction`: edit mode, an already loaded transaction (skips the fetch).
 * - `defaults`: create mode, values to start from (e.g. `{ type: 'INCOME' }` or a `fromAccountId`;
 *   an account given here counts as picked). Reset goes back to them.
 * - `onSaved(tx)`: after a successful save. Without it the form goes back (closes the modal, or
 *   returns to the transaction after an edit).
 * - `onCancel`: when given, the secondary button is "Cancel" and calls it. Otherwise an edit gets
 *   "Undo changes" (back to the saved values) and a new form has only Save.
 * - `compact`: for embedding in another screen (the dashboard setup step): no description line, no
 *   own scroll view or keyboard handling, and the buttons sit at the end of the form instead of a
 *   sticky bar. The host provides the scrolling.
 *
 * The form waits for the accounts, the user and `useActiveAccount().ready` before it mounts, so
 * the default account it shows is the stored pick, not the main-account fallback from before the
 * pick was read (src/core/COPIED_FROM.md).
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { router, type Href } from 'expo-router';
import * as React from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { Controller, useFieldArray, useForm, useFormState, useWatch } from 'react-hook-form';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SubmitButton } from '@/components/auth/submit-button';
import { CategoryDialog } from '@/components/categories/category-dialog';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { MoneyInput } from '@/components/common/money-input';
import { EmptyState, ErrorState } from '@/components/common/states';
import { DateTimeField } from '@/components/transactions/datetime-field';
import {
  CategoryChips,
  IntervalSwitcher,
  PickerField,
  TypeSwitcher,
  accountOptions,
  categoryOptions,
} from '@/components/transactions/transaction-form-fields';
import {
  BLANK,
  DESCRIPTION_PLACEHOLDER,
  EMPTY_ITEM,
  buildCreateInput,
  buildTransactionFields,
  effectiveAccountIds,
  localDateTimeToDate,
  sourceAccountId,
  splitItemsTotal,
  tidyMoneyText,
} from '@/components/transactions/transaction-form-model';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { ApiClientError } from '@/api/client';
import { toDatetimeLocal } from '@/core/format';
import { handleApiError } from '@/core/form-errors';
import { editBlockedByArchivedAccount, transactionFormValues } from '@/core/transaction-edit';
import { makeTransactionSchema, type TransactionFormValues } from '@/core/transaction-schema';
import type { Account, Transaction, TransactionType } from '@/core/types';
import { useAccounts } from '@/hooks/useAccounts';
import { useActiveAccount } from '@/hooks/useActiveAccount';
import { useCategories } from '@/hooks/useCategories';
import { useSuggestedAccountId } from '@/hooks/useSuggestedAccount';
import { useCreateTransaction, useTransaction, useUpdateTransaction } from '@/hooks/useTransactions';
import { useUser } from '@/hooks/useUser';
import { Archive, Plus, Repeat, Split, Trash2, Wallet } from '@/lib/icons';
import { cn } from '@/lib/utils';

export type TransactionFormProps = {
  mode?: 'create' | 'edit';
  transactionId?: string;
  transaction?: Transaction;
  defaults?: Partial<TransactionFormValues>;
  onSaved?: (tx: Transaction) => void;
  onCancel?: () => void;
  compact?: boolean;
};

/** The detail route is built separately; a typed href cast keeps this compiling before it exists. */
export function transactionHref(id: string): Href {
  return `/transactions/${id}` as Href;
}

export function TransactionForm(props: TransactionFormProps) {
  if (props.mode === 'edit' && !props.transaction) {
    return <EditTransactionLoader {...props} id={props.transactionId ?? ''} />;
  }
  return <TransactionFormGate {...props} />;
}

function EditTransactionLoader({ id, ...props }: TransactionFormProps & { id: string }) {
  const { data: tx, isLoading, isError, error, refetch } = useTransaction(id);
  if (isLoading) return <FormSkeleton compact={props.compact} />;
  if (isError || !tx) {
    const notFound = !isError || (error instanceof ApiClientError && error.status === 404);
    return (
      <FormFrame compact={props.compact}>
        {notFound ? (
          <ErrorState title="Transaction not found" description="It may have been deleted." />
        ) : (
          <ErrorState description="Couldn't load this transaction." onRetry={() => refetch()} />
        )}
      </FormFrame>
    );
  }
  // Keyed on the saved version, so a refetch after an edit elsewhere starts the form over.
  return <TransactionFormGate key={`${tx.id}:${tx.updatedAt}`} {...props} mode="edit" transaction={tx} />;
}

/** Waits for what the defaults depend on, and shows the archived / no-accounts states. */
function TransactionFormGate(props: TransactionFormProps) {
  const { transaction, compact } = props;
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { isLoading: userLoading } = useUser();
  const { ready } = useActiveAccount();

  if (transaction && editBlockedByArchivedAccount(transaction)) {
    return (
      <FormFrame compact={compact}>
        <EmptyState
          icon={Archive}
          title="This transaction is on an archived account"
          description="Archived accounts are read-only. Restore the account to edit this transaction, or delete the transaction instead."
        />
      </FormFrame>
    );
  }

  if (accountsLoading || userLoading || !ready) return <FormSkeleton compact={compact} />;

  if (!accounts || accounts.length === 0) {
    return (
      <FormFrame compact={compact}>
        <EmptyState
          icon={Wallet}
          title="Add an account first"
          description="You need at least one account before recording a transaction."
          action={
            <Button size="lg" onPress={() => router.push('/accounts')}>
              <Text>Add account</Text>
            </Button>
          }
        />
      </FormFrame>
    );
  }

  return <TransactionFormBody {...props} accounts={accounts} />;
}

function FormFrame({ compact, children }: { compact?: boolean; children: React.ReactNode }) {
  if (compact) return <View>{children}</View>;
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="w-full max-w-lg self-center p-4">
      {children}
    </ScrollView>
  );
}

function FormSkeleton({ compact }: { compact?: boolean }) {
  return (
    <FormFrame compact={compact}>
      <View accessibilityLabel="Loading" aria-busy className="gap-4">
        <Skeleton className="min-h-12 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="min-h-12 w-full rounded-xl" />
        <Skeleton className="min-h-12 w-full rounded-xl" />
      </View>
    </FormFrame>
  );
}

function FieldError({ message, center }: { message?: string; center?: boolean }) {
  if (!message) return null;
  return (
    <Text role="alert" className={cn('mt-1.5 text-sm text-destructive', center && 'text-center')}>
      {message}
    </Text>
  );
}

function FieldLabel({ children, nativeID }: { children: React.ReactNode; nativeID?: string }) {
  return (
    <Text nativeID={nativeID} className="mb-1.5 text-xs font-medium text-muted-foreground">
      {children}
    </Text>
  );
}

/** The window y of a view, for KeyboardAvoidingView's offset (it measures relative to its parent). */
function useWindowTop() {
  const ref = React.useRef<React.ComponentRef<typeof View>>(null);
  const [top, setTop] = React.useState(0);
  const onLayout = React.useCallback(() => {
    ref.current?.measureInWindow((_x, y) => setTop((prev) => (Math.abs(prev - y) > 1 ? y : prev)));
  }, []);
  return { ref, top, onLayout };
}

function TransactionFormBody({
  transaction,
  defaults,
  onSaved,
  onCancel,
  compact,
  accounts: accountList,
}: TransactionFormProps & { accounts: Account[] }) {
  const insets = useSafeAreaInsets();
  const editing = !!transaction;
  const recurringRoot = !!transaction?.isRecurring && !transaction.parentTransactionId;
  const { data: categories } = useCategories();
  const createMut = useCreateTransaction({ onView: (id) => router.push(transactionHref(id)) });
  const updateMut = useUpdateTransaction(transaction?.id ?? '');

  const selectableAccounts = recurringRoot
    ? accountList.filter((a) => a.currency === transaction.currency)
    : accountList;
  const schema = React.useMemo(() => makeTransactionSchema(accountList), [accountList]);

  // The saved values an edit starts from (and Reset goes back to). No SSR here, so "now" can be a
  // default value straight away (the web fills it in after mount).
  const initialValues = React.useMemo<TransactionFormValues>(
    () =>
      transaction
        ? transactionFormValues(transaction)
        : { ...BLANK, ...defaults, occurredAt: defaults?.occurredAt || toDatetimeLocal() },
    // Defaults are read once, when the form mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transaction],
  );
  const form = useForm<TransactionFormValues>({ resolver: zodResolver(schema), defaultValues: initialValues });
  const { control } = form;
  const { isDirty, errors } = useFormState({ control });

  const type = useWatch({ control, name: 'type' });
  const fromAccountId = useWatch({ control, name: 'fromAccountId' });
  const toAccountId = useWatch({ control, name: 'toAccountId' });
  const currency = useWatch({ control, name: 'currency' });
  const watchedItems = useWatch({ control, name: 'items' });
  const isRecurring = useWatch({ control, name: 'isRecurring' });
  const occurredAt = useWatch({ control, name: 'occurredAt' });

  const itemsArray = useFieldArray({ control, name: 'items' });
  const splitting = itemsArray.fields.length > 1;

  // A split's categories live on its lines, so the pre-split pick moves to the first line instead
  // of staying on the transaction too (the API rejects a split with both).
  function startSplit() {
    form.setValue('isRecurring', false);
    itemsArray.replace([
      { amountRaw: form.getValues('amountRaw'), categoryId: form.getValues('categoryId'), description: '' },
      { ...EMPTY_ITEM },
    ]);
    form.setValue('categoryId', undefined);
  }
  // Undoing the split hands the first line's category back to the transaction.
  function cancelSplit() {
    const firstLineCategory = form.getValues('items')?.[0]?.categoryId;
    itemsArray.replace([]);
    if (firstLineCategory) form.setValue('categoryId', firstLineCategory);
  }
  const [confirmTransfer, setConfirmTransfer] = React.useState(false);
  // Which category field the "New category" dialog was opened from: the main one or a split line.
  const [newCategoryFor, setNewCategoryFor] = React.useState<'main' | number | null>(null);
  function selectCreatedCategory(c: { id: string; type: string }) {
    // A category of the other type wouldn't appear in this form's list, so leave the field alone.
    if (c.type !== form.getValues('type')) return;
    if (newCategoryFor === 'main') form.setValue('categoryId', c.id, { shouldDirty: true });
    else if (typeof newCategoryFor === 'number')
      form.setValue(`items.${newCategoryFor}.categoryId`, c.id, { shouldDirty: true });
  }
  // A category belongs to one type, so a type change drops every pick.
  function clearCategories() {
    form.setValue('categoryId', undefined);
    // "" not undefined: react-hook-form falls back to a row's default for undefined.
    (form.getValues('items') ?? []).forEach((_, i) => form.setValue(`items.${i}.categoryId`, ''));
  }
  function switchToTransfer() {
    form.setValue('type', 'TRANSFER');
    clearCategories();
    cancelSplit();
  }

  const itemsTotal = splitItemsTotal(watchedItems, currency);

  // While split, the total is derived from the items, not entered.
  React.useEffect(() => {
    if (splitting) form.setValue('amountRaw', itemsTotal, { shouldValidate: false });
  }, [splitting, itemsTotal, form]);

  // Accounts: a picked one, else the suggested default (see effectiveAccountIds).
  const suggestedAccountId = useSuggestedAccountId();
  const { accountId: activeAccountId } = useActiveAccount();
  const { fromId: effectiveFromId, toId: effectiveToId } = effectiveAccountIds({
    type,
    accounts: accountList,
    fromAccountId,
    toAccountId,
    suggestedAccountId,
  });

  // Switching the active account is a deliberate choice, so it replaces any picked account.
  // Not while editing: the transaction's own accounts are what's being edited.
  const lastActiveId = React.useRef(activeAccountId);
  React.useEffect(() => {
    if (editing || lastActiveId.current === activeAccountId) return;
    lastActiveId.current = activeAccountId;
    form.setValue('fromAccountId', undefined);
    form.setValue('toAccountId', undefined);
  }, [activeAccountId, editing, form]);

  // Currency follows the account the money moves through.
  const sourceId = sourceAccountId(type, { fromId: effectiveFromId, toId: effectiveToId });
  React.useEffect(() => {
    const acct = accountList.find((a) => a.id === sourceId);
    if (acct && acct.currency !== currency) form.setValue('currency', acct.currency, { shouldValidate: false });
  }, [sourceId, accountList, currency, form]);

  const relevantCategories = (categories ?? []).filter((c) => (type === 'TRANSFER' ? false : c.type === type));

  // Back to the starting values: a blank expense (or the given defaults), or the transaction as saved.
  function resetForm() {
    form.reset(
      editing
        ? initialValues
        : { ...BLANK, ...defaults, occurredAt: defaults?.occurredAt || toDatetimeLocal(), items: [] },
    );
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else if (transaction) router.replace(transactionHref(transaction.id));
    // Opened from a link or reloaded (no history): close the way Cancel does, not stay on a blank form.
    else router.replace('/dashboard');
  }

  const pending = createMut.isPending || updateMut.isPending;

  async function submit() {
    if (pending) return;
    Keyboard.dismiss();
    // A tap doesn't blur the focused field on a phone, so tidy the amounts the way blur would.
    const cur = form.getValues('currency') || undefined;
    const items = form.getValues('items') ?? [];
    if (splitting) {
      items.forEach((item, i) => {
        const tidy = tidyMoneyText(item.amountRaw, cur);
        if (tidy !== item.amountRaw) form.setValue(`items.${i}.amountRaw`, tidy);
      });
      form.setValue('amountRaw', splitItemsTotal(form.getValues('items'), cur));
    } else {
      const raw = form.getValues('amountRaw');
      const tidy = tidyMoneyText(raw, cur);
      if (tidy !== raw) form.setValue('amountRaw', tidy);
    }

    // Commit the derived accounts so validation and submit see what the user sees.
    const picks = { from: fromAccountId, to: toAccountId };
    form.setValue('fromAccountId', effectiveFromId);
    form.setValue('toAccountId', effectiveToId);
    const valid = await form.trigger();
    if (!valid) {
      // Don't let a failed submit turn the defaults into "picked" accounts.
      form.setValue('fromAccountId', picks.from);
      form.setValue('toAccountId', picks.to);
      const first = Object.values(form.formState.errors).find((e) => e && typeof e.message === 'string');
      AccessibilityInfo.announceForAccessibility(
        typeof first?.message === 'string' ? first.message : 'Check the highlighted fields.',
      );
      return;
    }
    const v = form.getValues();

    try {
      if (editing) {
        const fields = buildTransactionFields(v, splitting);
        if (!fields) return;
        const tx = await updateMut.mutateAsync(fields);
        if (onSaved) onSaved(tx);
        else goBack();
        return;
      }
      const input = buildCreateInput(v, splitting);
      if (!input) return;
      const tx = await createMut.mutateAsync(input);
      resetForm();
      if (onSaved) onSaved(tx);
      else goBack();
    } catch (err) {
      handleApiError(err, { setError: form.setError });
    }
  }

  const { ref: frameRef, top: frameTop, onLayout: onFrameLayout } = useWindowTop();

  const fields = (
    <View className="gap-5">
      {!compact ? (
        <Text className="text-center text-sm text-muted-foreground">
          {editing ? 'Change any detail. Balances, summaries and goals follow.' : 'Record an expense, income or transfer.'}
        </Text>
      ) : null}

      <View>
        <TypeSwitcher
          disabled={recurringRoot}
          value={type}
          onChange={(t: TransactionType) => {
            // Transfers have no category and can't be split: don't silently drop entered split rows.
            if (t === 'TRANSFER' && splitting) {
              setConfirmTransfer(true);
              return;
            }
            if (t === type) return;
            form.setValue('type', t);
            clearCategories();
          }}
        />
        {recurringRoot ? (
          <Text className="mt-1.5 text-center text-xs text-muted-foreground">
            A recurring series keeps its type and currency.
          </Text>
        ) : null}
      </View>

      <Controller
        control={control}
        name="amountRaw"
        render={({ field, fieldState }) => (
          <View className="rounded-2xl bg-muted/50 px-4 py-6">
            <MoneyInput
              large
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              currency={currency || undefined}
              disabled={splitting}
              invalid={!!fieldState.error}
              accessibilityLabel={currency ? `Amount in ${currency}` : 'Amount'}
              testID="transaction-amount"
            />
            {splitting ? (
              <Text className="mt-1 text-center text-xs text-muted-foreground">Calculated from the items below.</Text>
            ) : (
              <FieldError center message={fieldState.error?.message} />
            )}
          </View>
        )}
      />

      {/* What was it for? Description + one-tap category in one grouped surface. */}
      <View className="rounded-2xl bg-muted/50 p-4">
        <Controller
          control={control}
          name="description"
          render={({ field, fieldState }) => (
            <View>
              <Input
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                placeholder={DESCRIPTION_PLACEHOLDER[type] ?? DESCRIPTION_PLACEHOLDER.EXPENSE}
                accessibilityLabel="Description"
                testID="transaction-description"
                aria-invalid={!!fieldState.error}
                returnKeyType="done"
                maxLength={140}
                className="min-h-11 border-0 bg-transparent px-0 text-base shadow-none dark:bg-transparent"
              />
              <FieldError message={fieldState.error?.message} />
            </View>
          )}
        />

        {type !== 'TRANSFER' && !splitting ? (
          <>
            <View className="my-3 h-px bg-border/70" />
            <Controller
              control={control}
              name="categoryId"
              render={({ field, fieldState }) => (
                <View>
                  <CategoryChips
                    categories={relevantCategories}
                    value={field.value}
                    onChange={field.onChange}
                    onCreate={() => setNewCategoryFor('main')}
                  />
                  <FieldError message={fieldState.error?.message} />
                </View>
              )}
            />
          </>
        ) : null}
      </View>

      {/* A recurring transaction can't be split (create refuses it too). */}
      {type !== 'TRANSFER' && !splitting && !recurringRoot ? (
        <View className="-mt-2 flex-row justify-end">
          <Pressable
            role="button"
            accessibilityLabel="Split transaction"
            onPress={startSplit}
            className="min-h-11 flex-row items-center gap-1.5 px-1 active:opacity-70">
            <Icon as={Split} size={16} aria-hidden className="text-primary-text" />
            <Text className="text-sm font-medium text-primary-text">Split transaction</Text>
          </Pressable>
        </View>
      ) : null}

      {type !== 'TRANSFER' && splitting ? (
        <View className="gap-3 rounded-2xl bg-muted/50 p-4">
          <View className="flex-row items-center justify-between">
            <Text role="heading" aria-level={2} className="text-sm font-medium">
              Split into {itemsArray.fields.length} items
            </Text>
            <Pressable
              role="button"
              accessibilityLabel="Remove split"
              onPress={cancelSplit}
              className="min-h-11 justify-center px-1 active:opacity-70">
              <Text className="text-xs font-medium text-primary-text">Remove split</Text>
            </Pressable>
          </View>

          {itemsArray.fields.map((row, i) => (
            <View key={row.id} className="flex-row items-start gap-2">
              <Text aria-hidden className="mt-3 w-4 shrink-0 text-xs text-muted-foreground">
                {i + 1}
              </Text>
              <View className="min-w-0 flex-1 gap-2">
                <View className="flex-row items-start gap-2">
                  <Controller
                    control={control}
                    name={`items.${i}.amountRaw`}
                    render={({ field, fieldState }) => (
                      <View className="min-w-0 flex-1">
                        <MoneyInput
                          value={field.value ?? ''}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          currency={currency || undefined}
                          invalid={!!fieldState.error}
                          accessibilityLabel={`Item ${i + 1} amount`}
                          testID={`item-${i}-amount`}
                        />
                        <FieldError message={fieldState.error?.message} />
                      </View>
                    )}
                  />
                  <Pressable
                    role="button"
                    accessibilityLabel={`Remove item ${i + 1}`}
                    accessibilityState={{ disabled: itemsArray.fields.length <= 2 }}
                    disabled={itemsArray.fields.length <= 2}
                    onPress={() => itemsArray.remove(i)}
                    className={cn(
                      'size-11 items-center justify-center rounded-md active:bg-accent',
                      itemsArray.fields.length <= 2 && 'opacity-40',
                    )}>
                    <Icon as={Trash2} size={16} aria-hidden className="text-muted-foreground" />
                  </Pressable>
                </View>
                <Controller
                  control={control}
                  name={`items.${i}.categoryId`}
                  render={({ field }) => (
                    <View className="flex-row items-center gap-2">
                      <PickerField
                        title="Category"
                        accessibilityLabel={`Item ${i + 1} category`}
                        options={categoryOptions(relevantCategories)}
                        value={field.value || undefined}
                        onChange={(v) => field.onChange(v)}
                        placeholder="Uncategorized"
                        emptyOption="Uncategorized"
                        className="min-h-11 flex-1 rounded-md border border-input bg-background dark:bg-input/30"
                      />
                      <Pressable
                        role="button"
                        accessibilityLabel={`New category for item ${i + 1}`}
                        onPress={() => setNewCategoryFor(i)}
                        className="size-11 items-center justify-center rounded-md active:bg-accent">
                        <Icon as={Plus} size={16} aria-hidden className="text-muted-foreground" />
                      </Pressable>
                    </View>
                  )}
                />
                <Controller
                  control={control}
                  name={`items.${i}.description`}
                  render={({ field, fieldState }) => (
                    <View>
                      <Input
                        value={field.value ?? ''}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        placeholder="Item description (optional)"
                        accessibilityLabel={`Item ${i + 1} note`}
                        maxLength={140}
                        className="min-h-11 text-sm"
                      />
                      <FieldError message={fieldState.error?.message} />
                    </View>
                  )}
                />
              </View>
            </View>
          ))}

          <FieldError message={errors.items?.root?.message} />
          <FieldError message={typeof errors.items?.message === 'string' ? errors.items.message : undefined} />

          <View className="items-center pt-1">
            <Pressable
              role="button"
              accessibilityLabel="Add item"
              onPress={() => itemsArray.append({ ...EMPTY_ITEM })}
              className="min-h-11 flex-row items-center gap-1.5 rounded-full bg-primary px-5 active:opacity-80">
              <Icon as={Plus} size={16} aria-hidden className="text-primary-foreground" />
              <Text className="text-xs font-semibold text-primary-foreground">Add item</Text>
            </Pressable>
          </View>

          <Text
            accessibilityLiveRegion="polite"
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-right text-xs text-muted-foreground">
            Total: {itemsTotal} {currency}
          </Text>
        </View>
      ) : null}

      <View className="gap-4">
        {type !== 'INCOME' ? (
          <Controller
            control={control}
            name="fromAccountId"
            render={({ field, fieldState }) => (
              <View>
                <FieldLabel>{type === 'TRANSFER' ? 'From' : 'Account'}</FieldLabel>
                <PickerField
                  title={type === 'TRANSFER' ? 'From' : 'Account'}
                  accessibilityLabel={type === 'TRANSFER' ? 'From account' : 'Account'}
                  options={accountOptions(selectableAccounts)}
                  value={effectiveFromId}
                  onChange={(id) => id && field.onChange(id)}
                  placeholder="Select account"
                  invalid={!!fieldState.error}
                  testID="from-account"
                />
                <FieldError message={fieldState.error?.message} />
              </View>
            )}
          />
        ) : null}
        {type !== 'EXPENSE' ? (
          <Controller
            control={control}
            name="toAccountId"
            render={({ field, fieldState }) => (
              <View>
                <FieldLabel>{type === 'TRANSFER' ? 'To' : 'Account'}</FieldLabel>
                <PickerField
                  title={type === 'TRANSFER' ? 'To' : 'Account'}
                  accessibilityLabel={type === 'TRANSFER' ? 'To account' : 'Account'}
                  options={accountOptions(selectableAccounts)}
                  value={effectiveToId}
                  onChange={(id) => id && field.onChange(id)}
                  placeholder="Select account"
                  invalid={!!fieldState.error}
                  testID="to-account"
                />
                <FieldError message={fieldState.error?.message} />
              </View>
            )}
          />
        ) : null}
        <Controller
          control={control}
          name="occurredAt"
          render={({ field, fieldState }) => (
            <View>
              <FieldLabel>Date</FieldLabel>
              <DateTimeField
                mode="datetime"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                accessibilityLabel="Date"
                invalid={!!fieldState.error}
                testID="occurred-at"
              />
              <FieldError message={fieldState.error?.message} />
            </View>
          )}
        />
      </View>

      {!splitting && !editing ? (
        <View className="gap-4 rounded-2xl bg-muted/50 p-4">
          <Controller
            control={control}
            name="isRecurring"
            render={({ field, fieldState }) => (
              <View>
                <View className="min-h-11 flex-row items-center justify-between gap-2">
                  <View className="flex-1 flex-row items-center gap-1.5">
                    <Icon as={Repeat} size={16} aria-hidden className="text-muted-foreground" />
                    <Label nativeID="tx-repeat" onPress={() => field.onChange(!field.value)}>
                      Repeat this transaction
                    </Label>
                  </View>
                  <Switch
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                    aria-labelledby="tx-repeat"
                    accessibilityLabel="Repeat this transaction"
                    hitSlop={12}
                  />
                </View>
                <FieldError message={fieldState.error?.message} />
              </View>
            )}
          />

          {isRecurring ? (
            <View className="gap-3">
              <Controller
                control={control}
                name="recurringInterval"
                render={({ field, fieldState }) => (
                  <View>
                    <Text className="mb-1.5 text-sm font-medium">Every</Text>
                    <IntervalSwitcher value={field.value} onChange={field.onChange} invalid={!!fieldState.error} />
                    <FieldError message={fieldState.error?.message} />
                  </View>
                )}
              />
              <Controller
                control={control}
                name="recurringEndDate"
                render={({ field, fieldState }) => (
                  <View>
                    <Text className="mb-1.5 text-sm font-medium">
                      Ends <Text className="text-sm text-muted-foreground">(optional)</Text>
                    </Text>
                    <DateTimeField
                      mode="date"
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      accessibilityLabel="End date"
                      placeholder="No end date"
                      clearable
                      initialDate={localDateTimeToDate(occurredAt) ?? undefined}
                      invalid={!!fieldState.error}
                      testID="recurring-end-date"
                    />
                    <FieldError message={fieldState.error?.message} />
                  </View>
                )}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const buttons = (
    <View className="flex-row gap-3">
      {onCancel ? (
        <Button variant="secondary" size="lg" className="min-h-12 flex-1 rounded-xl" onPress={onCancel}>
          <Text className="text-base">Cancel</Text>
        </Button>
      ) : editing ? (
        // A new form needs no reset: the header's ✕ discards it. An edit can go back to what was saved.
        <Button
          variant="secondary"
          size="lg"
          className="min-h-12 flex-1 rounded-xl"
          onPress={resetForm}
          disabled={!isDirty || pending}>
          <Text className="text-base">Undo changes</Text>
        </Button>
      ) : null}
      <SubmitButton
        testID="transaction-submit"
        pending={pending}
        pendingText="Saving…"
        className="min-h-12 flex-1 rounded-xl"
        onPress={() => void submit()}>
        {editing ? 'Save changes' : 'Save transaction'}
      </SubmitButton>
    </View>
  );

  const dialogs = (
    <>
      <CategoryDialog
        open={newCategoryFor !== null}
        onOpenChange={(o) => !o && setNewCategoryFor(null)}
        defaultType={type === 'INCOME' ? 'INCOME' : 'EXPENSE'}
        onCreated={selectCreatedCategory}
      />
      <ConfirmDialog
        open={confirmTransfer}
        onOpenChange={setConfirmTransfer}
        title="Switch to Transfer?"
        description="Transfers can't be split or categorised, so the split items you entered will be removed."
        confirmLabel="Switch to Transfer"
        onConfirm={() => {
          setConfirmTransfer(false);
          switchToTransfer();
        }}
      />
    </>
  );

  if (compact) {
    return (
      <View className="gap-5">
        {fields}
        {buttons}
        {dialogs}
      </View>
    );
  }

  return (
    <View ref={frameRef} onLayout={onFrameLayout} className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={frameTop}>
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerClassName="w-full max-w-lg self-center p-4 pb-8">
          {fields}
        </ScrollView>
        {/* Sticky actions above the home indicator. */}
        <View
          className="border-t border-border bg-background px-4 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          <View className="w-full max-w-lg self-center">{buttons}</View>
        </View>
      </KeyboardAvoidingView>
      {dialogs}
    </View>
  );
}
