import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { SheetScrollView } from '@/components/ui/sheet-parts';

import { MoneyInput } from '@/components/common/money-input';
import { DateTimeField } from '@/components/transactions/datetime-field';
import { accountOptions, PickerField } from '@/components/transactions/transaction-form-fields';
import { tidyMoneyText } from '@/components/transactions/transaction-form-model';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { goalExplainer, goalRuleHint, goalScopeLabel } from '@/core/goal-scope';
import type { Goal, GoalRecurrenceUnit, GoalType } from '@/core/types';
import { useAccounts } from '@/hooks/useAccounts';
import { writableAccounts } from '@/core/account-sharing';
import { useActiveAccount } from '@/hooks/useActiveAccount';
import { useCreateGoal, useUpdateGoal } from '@/hooks/useGoals';
import { PiggyBank, TrendingDown, TrendingUp } from '@/lib/icons';
import { cn } from '@/lib/utils';

import { initialGoalDraft, validateGoalDraft, type GoalDraft, type GoalErrors } from './goal-form-state';

const GOAL_TYPES: { value: GoalType; label: string; hint: string; icon: LucideIcon }[] = [
  { value: 'BALANCE', label: 'Balance', hint: 'Save up', icon: PiggyBank },
  { value: 'INCOME', label: 'Income', hint: 'Earn more', icon: TrendingUp },
  { value: 'EXPENSE', label: 'Expense', hint: 'Spend less', icon: TrendingDown },
];

const UNITS: { value: GoalRecurrenceUnit; label: string }[] = [
  { value: 'MONTH', label: 'Month' },
  { value: 'YEAR', label: 'Year' },
];

function FieldError({ message }: { message?: string }) {
  return message ? (
    <Text role="alert" className="text-sm text-destructive">
      {message}
    </Text>
  ) : null;
}

/** New goal / Edit goal. Editing changes the name and target only; the rest is fixed once created. */
function GoalDialogBody({
  onOpenChange,
  goal,
}: {
  onOpenChange: (open: boolean) => void;
  goal?: Goal;
}) {
  const isEdit = !!goal;
  const { data: accounts } = useAccounts();
  const { accountId: activeAccountId } = useActiveAccount();
  const createMut = useCreateGoal();
  const updateMut = useUpdateGoal();
  const { height } = useWindowDimensions();

  const [draft, setDraft] = React.useState<GoalDraft>(() =>
    initialGoalDraft(goal, activeAccountId, new Date().toISOString().slice(0, 10)),
  );
  const [errors, setErrors] = React.useState<GoalErrors>({});
  const [pending, setPending] = React.useState(false);
  const set = <K extends keyof GoalDraft>(key: K, value: GoalDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const accountList = writableAccounts(accounts ?? []);
  const scopeAccount = accountList.find((a) => a.id === draft.accountId);
  const explainer = goalExplainer(draft.type);

  async function submit() {
    if (pending) return;
    const tidy = { ...draft, targetAmount: tidyMoneyText(draft.targetAmount, scopeAccount?.currency) };
    setDraft(tidy);
    const result = validateGoalDraft(tidy);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      if (goal) {
        await updateMut.mutateAsync({ id: goal.id, name: result.input.name, targetAmount: result.input.targetAmount });
      } else {
        await createMut.mutateAsync(result.input);
      }
      onOpenChange(false);
    } catch {
      // The hook already showed the error toast.
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md" style={{ maxHeight: height - 32 }}>
        <DialogHeader className="border-b border-border px-4 py-3 pr-12">
          <DialogTitle>{isEdit ? 'Edit goal' : 'New goal'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this goal's name or target amount."
              : 'Set a balance, income or expense target for one of your accounts.'}
          </DialogDescription>
        </DialogHeader>

        <SheetScrollView contentContainerClassName="gap-4 px-4 py-4">
          <View className="gap-1.5">
            <Text className="text-sm font-medium">Name</Text>
            <Input
              value={draft.name}
              onChangeText={(v) => set('name', v)}
              placeholder="e.g. Emergency fund"
              autoComplete="off"
              accessibilityLabel="Name"
              returnKeyType="done"
              className={errors.name ? 'min-h-11 border-destructive' : 'min-h-11'}
            />
            <FieldError message={errors.name} />
          </View>

          <View className="gap-1.5">
            <Text className="text-sm font-medium">Goal type</Text>
            <View role="radiogroup" accessibilityLabel="Goal type" className="flex-row gap-2">
              {GOAL_TYPES.map(({ value, label, hint, icon }) => {
                const selected = draft.type === value;
                return (
                  <Pressable
                    key={value}
                    role="radio"
                    aria-checked={selected}
                    accessibilityLabel={`${label}, ${hint}`}
                    accessibilityState={{ checked: selected, disabled: isEdit }}
                    disabled={isEdit}
                    onPress={() => set('type', value)}
                    className={cn(
                      'min-h-[72px] flex-1 items-start gap-1 rounded-xl border p-3',
                      selected ? 'border-primary bg-primary/5' : 'border-border',
                      isEdit && !selected && 'opacity-60',
                    )}>
                    <Icon as={icon} size={16} aria-hidden className={selected ? 'text-primary-text' : 'text-muted-foreground'} />
                    <Text className="text-sm font-medium">{label}</Text>
                    <Text numberOfLines={1} className="text-xs text-muted-foreground">
                      {hint}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {/* What the type counts and when it is judged (the web shows this on hover / in help). */}
            <View className="gap-1 rounded-lg bg-muted/40 p-3" testID="goal-explainer">
              <Text testID="goal-scope" className="text-sm font-medium">
                {goalScopeLabel(draft.type, scopeAccount?.name)}
              </Text>
              <Text className="text-xs text-muted-foreground">Target: {explainer.target}</Text>
              <Text className="text-xs text-muted-foreground">Progress: {explainer.progress}</Text>
              <Text testID="goal-rule" className="text-xs text-muted-foreground">
                {goalRuleHint(draft.type)}
              </Text>
            </View>
          </View>

          <View className="gap-1.5">
            <Text className="text-sm font-medium">Account</Text>
            <PickerField
              title="Account"
              accessibilityLabel="Account"
              options={accountOptions(accountList)}
              value={draft.accountId || undefined}
              onChange={(v) => set('accountId', v ?? '')}
              placeholder="Select an account"
              invalid={!!errors.accountId}
              disabled={isEdit}
            />
            <FieldError message={errors.accountId} />
          </View>

          <View className="gap-1.5">
            <Text className="text-sm font-medium">Target amount</Text>
            <MoneyInput
              value={draft.targetAmount}
              onChange={(v) => set('targetAmount', v)}
              currency={scopeAccount?.currency}
              invalid={!!errors.targetAmount}
              accessibilityLabel="Target amount"
            />
            <FieldError message={errors.targetAmount} />
          </View>

          {!isEdit ? (
            <View className="gap-4 rounded-xl bg-muted/40 p-3">
              <View className="min-h-11 flex-row items-center justify-between gap-3">
                <Text className="text-sm font-medium">Recurring</Text>
                <Switch
                  checked={draft.isRecurring}
                  onCheckedChange={(v) => set('isRecurring', v)}
                  accessibilityLabel="Recurring"
                />
              </View>

              <View className="gap-1.5">
                <Text className="text-sm font-medium">{draft.isRecurring ? 'First period starts' : 'Start date'}</Text>
                <DateTimeField
                  mode="date"
                  value={draft.periodStart}
                  onChange={(v) => set('periodStart', v)}
                  accessibilityLabel={draft.isRecurring ? 'First period starts' : 'Start date'}
                  initialDate={new Date()}
                  invalid={!!errors.periodStart}
                />
                <FieldError message={errors.periodStart} />
              </View>

              {draft.isRecurring ? (
                <View className="gap-1.5">
                  <Text className="text-sm font-medium">Repeats every</Text>
                  <View
                    role="radiogroup"
                    accessibilityLabel="Repeats every"
                    className={cn('flex-row gap-1 rounded-xl bg-background/70 p-1', errors.recurrenceUnit && 'border border-destructive')}>
                    {UNITS.map((u) => {
                      const selected = draft.recurrenceUnit === u.value;
                      return (
                        <Pressable
                          key={u.value}
                          role="radio"
                          aria-checked={selected}
                          accessibilityLabel={u.label}
                          accessibilityState={{ checked: selected }}
                          onPress={() => set('recurrenceUnit', u.value)}
                          className={cn('min-h-11 flex-1 items-center justify-center rounded-lg', selected && 'bg-card shadow-sm shadow-black/5')}>
                          <Text className={cn('text-sm font-medium', !selected && 'text-muted-foreground')}>{u.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <FieldError message={errors.recurrenceUnit} />
                </View>
              ) : (
                <View className="gap-1.5">
                  <Text className="text-sm font-medium">End date</Text>
                  <DateTimeField
                    mode="date"
                    value={draft.periodEnd}
                    onChange={(v) => set('periodEnd', v)}
                    accessibilityLabel="End date"
                    initialDate={new Date()}
                    invalid={!!errors.periodEnd}
                  />
                  <FieldError message={errors.periodEnd} />
                </View>
              )}
            </View>
          ) : null}
        </SheetScrollView>

        <View className="flex-row justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="ghost" className="min-h-11" onPress={() => onOpenChange(false)} accessibilityLabel="Cancel">
            <Text>Cancel</Text>
          </Button>
          <Button className="min-h-11" disabled={pending} aria-busy={pending} onPress={submit}>
            <Text>{pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create goal'}</Text>
          </Button>
        </View>
      </DialogContent>
    </Dialog>
  );
}

/** Mounts the form only while open, so every opening starts from fresh state. */
export function GoalDialog({ open, ...props }: { open: boolean; onOpenChange: (open: boolean) => void; goal?: Goal }) {
  return open ? <GoalDialogBody {...props} /> : null;
}
