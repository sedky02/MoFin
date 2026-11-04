// A recurring series' panel and actions: cadence and next date (or why it is paused), and Edit /
// Pause / Resume / Cancel series. Shared by a root's detail screen and the Recurring list. The
// same rules and wording as the web's recurring-panel.
import * as React from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { MoneyInput } from '@/components/common/money-input';
import { DateTimeField } from '@/components/transactions/datetime-field';
import {
  accountOptions,
  categoryOptions,
  IntervalSwitcher,
  PickerField,
} from '@/components/transactions/transaction-form-fields';
import { validateRecurringEdit, type RecurringEditErrors } from '@/components/transactions/recurring-series-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { formatDate } from '@/core/format';
import {
  buildRecurringUpdate,
  recurringFormValues,
  seriesAccountOptions,
  type RecurringFormValues,
} from '@/core/recurring-edit';
import {
  seriesIntervalLabel,
  seriesIsActive,
  seriesIsOpen,
  seriesIsPaused,
  seriesNextOccurrence,
  seriesPausedLabel,
} from '@/core/recurring-series';
import type { Transaction } from '@/core/types';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import {
  useCancelRecurringTransaction,
  usePauseRecurringTransaction,
  useResumeRecurringTransaction,
  useUpdateRecurringTransaction,
} from '@/hooks/useTransactions';
import { PauseCircle, Repeat } from '@/lib/icons';
import { cn } from '@/lib/utils';

/** "Paused", or "Paused: <why it couldn't post>", in place of a series' next date. */
export function SeriesPausedNote({ label, className }: { label: string; className?: string }) {
  return (
    <View className={cn('flex-row items-center gap-1', className)}>
      <Icon as={PauseCircle} size={12} aria-hidden className="text-warning" />
      <Text className="shrink text-xs font-medium text-warning">{label}</Text>
    </View>
  );
}

/**
 * Shown on the root transaction of a recurring series. Displays cadence and the next occurrence
 * (or why it is paused), and lets the user edit the template (future occurrences only), pause or
 * resume it, or cancel the series (stops future generation; nothing already generated is touched).
 */
export function RecurringPanel({ tx }: { tx: Transaction }) {
  const next = seriesNextOccurrence(tx);
  const pausedLabel = seriesPausedLabel(tx);
  return (
    <View className="mt-4 gap-3 border-t border-border pt-4" accessibilityLabel="Recurring series">
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-2">
        <Badge variant={seriesIsActive(tx) ? 'secondary' : 'outline'}>
          <Icon as={Repeat} size={12} aria-hidden />
          <Text>
            {seriesIntervalLabel(tx)}
            {tx.recurringStatus === 'CANCELLED' ? ' · Cancelled' : ''}
          </Text>
        </Badge>
        {next ? <Text className="text-xs text-muted-foreground">Next on {formatDate(next)}</Text> : null}
        {pausedLabel ? <SeriesPausedNote label={pausedLabel} /> : null}
      </View>
      {seriesIsOpen(tx) ? <RecurringSeriesActions tx={tx} /> : null}
    </View>
  );
}

/**
 * "Edit series", "Pause series" (or "Resume series" once paused) and "Cancel series" for a series
 * root that is not cancelled. Cancelling stops the series and keeps every transaction, the root
 * included; deleting the root is separate. Resuming skips what fell due while paused, and the API
 * refuses (the toast says why) while the series still cannot post.
 */
export function RecurringSeriesActions({ tx, className }: { tx: Transaction; className?: string }) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const pauseMut = usePauseRecurringTransaction(tx.id);
  const resumeMut = useResumeRecurringTransaction(tx.id);
  const cancelMut = useCancelRecurringTransaction(tx.id);
  const paused = seriesIsPaused(tx);

  return (
    <View className={cn('flex-row flex-wrap gap-2', className)}>
      {paused ? (
        <Button size="sm" className="min-h-11" accessibilityLabel="Resume series" disabled={resumeMut.isPending} onPress={() => resumeMut.mutate()}>
          <Text>Resume series</Text>
        </Button>
      ) : null}
      <Button variant="outline" size="sm" className="min-h-11" accessibilityLabel="Edit series" onPress={() => setEditOpen(true)}>
        <Text>Edit series</Text>
      </Button>
      {!paused ? (
        <Button variant="outline" size="sm" className="min-h-11" accessibilityLabel="Pause series" disabled={pauseMut.isPending} onPress={() => pauseMut.mutate()}>
          <Text>Pause series</Text>
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" className="min-h-11" accessibilityLabel="Cancel series" onPress={() => setCancelOpen(true)}>
        <Text className="text-destructive">Cancel series</Text>
      </Button>

      {editOpen ? <EditSeriesDialog tx={tx} onClose={() => setEditOpen(false)} /> : null}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel recurring transaction?"
        description={`No further occurrences of “${tx.description}” will be generated. Transactions already recorded, this one included, are not affected.`}
        cancelLabel="Keep it"
        confirmLabel="Cancel series"
        onConfirm={() => {
          setCancelOpen(false);
          cancelMut.mutate();
        }}
      />
    </View>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <Text role="alert" className="text-sm text-destructive">
      {message}
    </Text>
  ) : null;
}

/** Edits the series template. Mounted only while open, so each open starts from the series as it is now. */
function EditSeriesDialog({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { height } = useWindowDimensions();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const updateMut = useUpdateRecurringTransaction(tx.id);
  const [initial] = React.useState(() => recurringFormValues(tx));
  const [values, setValues] = React.useState<RecurringFormValues>(initial);
  const [errors, setErrors] = React.useState<RecurringEditErrors>({});
  const set = <K extends keyof RecurringFormValues>(key: K, value: RecurringFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  const isTransfer = tx.type === 'TRANSFER';
  // Only accounts the series can post to: its currency, and for a transfer not the other side.
  const fromOptions = seriesAccountOptions(accounts ?? [], tx.currency, isTransfer ? values.toAccountId : undefined);
  const toOptions = seriesAccountOptions(accounts ?? [], tx.currency, isTransfer ? values.fromAccountId : undefined);
  const relevantCategories = (categories ?? []).filter((c) => c.type === tx.type);

  async function save() {
    if (updateMut.isPending) return;
    const found = validateRecurringEdit(initial, values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const input = buildRecurringUpdate(tx.type, initial, values);
    if (Object.keys(input).length === 0) {
      onClose();
      return;
    }
    try {
      await updateMut.mutateAsync(input);
      onClose();
    } catch {
      // The hook already showed the error toast.
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-0 p-0 sm:max-w-md" style={{ maxHeight: height - 32 }}>
        <DialogHeader className="border-b border-border px-4 py-3 pr-12">
          <DialogTitle>Edit recurring transaction</DialogTitle>
          <DialogDescription>Changes only affect occurrences generated from now on.</DialogDescription>
        </DialogHeader>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerClassName="gap-4 px-4 py-4">
          <View className="gap-1.5">
            <Text className="text-sm font-medium">Description</Text>
            <Input
              value={values.description}
              onChangeText={(v) => set('description', v)}
              accessibilityLabel="Description"
              autoComplete="off"
              className={errors.description ? 'min-h-11 border-destructive' : 'min-h-11'}
            />
            <FieldError message={errors.description} />
          </View>
          <View className="gap-1.5">
            <Text className="text-sm font-medium">Amount</Text>
            <MoneyInput
              value={values.amountRaw}
              onChange={(v) => set('amountRaw', v)}
              currency={tx.currency}
              invalid={!!errors.amountRaw}
              accessibilityLabel="Amount"
            />
            <FieldError message={errors.amountRaw} />
          </View>
          {tx.type !== 'INCOME' ? (
            <View className="gap-1.5">
              <Text className="text-sm font-medium">{isTransfer ? 'From account' : 'Account'}</Text>
              <PickerField
                title={isTransfer ? 'From account' : 'Account'}
                accessibilityLabel={isTransfer ? 'From account' : 'Account'}
                options={accountOptions(fromOptions)}
                value={values.fromAccountId}
                onChange={(v) => set('fromAccountId', v)}
                placeholder="Select account"
                emptyText="No accounts in this currency."
              />
            </View>
          ) : null}
          {tx.type !== 'EXPENSE' ? (
            <View className="gap-1.5">
              <Text className="text-sm font-medium">{isTransfer ? 'To account' : 'Account'}</Text>
              <PickerField
                title={isTransfer ? 'To account' : 'Account'}
                accessibilityLabel={isTransfer ? 'To account' : 'Account'}
                options={accountOptions(toOptions)}
                value={values.toAccountId}
                onChange={(v) => set('toAccountId', v)}
                placeholder="Select account"
                emptyText="No accounts in this currency."
              />
            </View>
          ) : null}
          {!isTransfer ? (
            <View className="gap-1.5">
              <Text className="text-sm font-medium">
                Category <Text className="font-normal text-muted-foreground">(optional)</Text>
              </Text>
              <PickerField
                title="Category"
                accessibilityLabel="Category"
                options={categoryOptions(relevantCategories)}
                value={values.categoryId}
                onChange={(v) => set('categoryId', v)}
                placeholder="Uncategorized"
                emptyOption="Uncategorized"
                emptyText="No categories yet."
              />
            </View>
          ) : null}
          <View className="gap-1.5">
            <Text className="text-sm font-medium">Every</Text>
            <IntervalSwitcher value={values.recurringInterval} onChange={(v) => set('recurringInterval', v)} />
          </View>
          <View className="gap-1.5">
            <Text className="text-sm font-medium">
              Ends <Text className="font-normal text-muted-foreground">(optional)</Text>
            </Text>
            <DateTimeField
              mode="date"
              value={values.recurringEndDate}
              onChange={(v) => set('recurringEndDate', v)}
              accessibilityLabel="Ends"
              placeholder="No end date"
              clearable
              invalid={!!errors.recurringEndDate}
            />
            <FieldError message={errors.recurringEndDate} />
          </View>
        </ScrollView>
        <View className="flex-row justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" className="min-h-11" onPress={onClose} accessibilityLabel="Close">
            <Text>Cancel</Text>
          </Button>
          <Button className="min-h-11" disabled={updateMut.isPending} onPress={save} accessibilityLabel="Save changes">
            <Text>{updateMut.isPending ? 'Saving…' : 'Save changes'}</Text>
          </Button>
        </View>
      </DialogContent>
    </Dialog>
  );
}
