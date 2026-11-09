import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { HelpHint } from '@/components/common/help-hint';
import { MoneyInput } from '@/components/common/money-input';
import { DateTimeField } from '@/components/transactions/datetime-field';
import { accountOptions, categoryOptions, PickerField } from '@/components/transactions/transaction-form-fields';
import { tidyMoneyText } from '@/components/transactions/transaction-form-model';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { SheetScrollView } from '@/components/ui/sheet-parts';
import { Text } from '@/components/ui/text';
import { categoryScope, writableAccounts } from '@/core/account-sharing';
import { formatDate, parseMoneyInput } from '@/core/format';
import { formatTargetAmount, goalAllCategoriesLabel, goalRuleHint } from '@/core/goal-scope';
import type { Goal, GoalRecurrenceUnit, GoalType } from '@/core/types';
import { useAccounts } from '@/hooks/useAccounts';
import { useActiveAccount } from '@/hooks/useActiveAccount';
import { useCategories } from '@/hooks/useCategories';
import { useCreateGoal, useUpdateGoal } from '@/hooks/useGoals';
import { ArrowLeft, ChevronRight, Plus, TrendingDown, TrendingUp } from '@/lib/icons';
import { cn } from '@/lib/utils';

import { initialGoalDraft, validateGoalDraft, type GoalDraft, type GoalErrors } from './goal-form-state';

// The same two steps as the web's New goal dialog: what the goal is for, then its details.
const INTENTS: { type: GoalType; label: string; hint: string; icon: LucideIcon; tint: string }[] = [
  { type: 'BALANCE', label: 'Save up', hint: 'Grow an account to an amount', icon: Plus, tint: 'text-primary-text' },
  { type: 'INCOME', label: 'Earn more', hint: 'Reach an income target', icon: TrendingUp, tint: 'text-chart-2' },
  { type: 'EXPENSE', label: 'Spend less', hint: 'Stay under a spending limit', icon: TrendingDown, tint: 'text-warning' },
];

const LABELS: Record<GoalType, { amount: string; category?: string; account: string; until: string }> = {
  EXPENSE: { amount: 'Spending limit', category: 'Spending category', account: 'Account you pay from', until: 'Last day' },
  INCOME: { amount: 'Income target', category: 'Income category', account: "Account you're paid into", until: 'Last day' },
  BALANCE: { amount: 'Amount to save', account: 'Account you save in', until: 'Reach it by' },
};

const CATEGORY_RULE = "Transfers don't count. A split transaction counts only its part in this category.";

type Cadence = GoalRecurrenceUnit | 'ONCE';
const CADENCES: { value: Cadence; label: string }[] = [
  { value: 'MONTH', label: 'Every month' },
  { value: 'YEAR', label: 'Every year' },
  { value: 'ONCE', label: 'Just once' },
];
const CADENCE_PHRASE: Record<Cadence, string> = { MONTH: ' a month', YEAR: ' a year', ONCE: '' };

/** The goal said in one line from what was picked: "Spend under $300 a month on Restaurants". */
export function suggestedGoalName(
  type: GoalType,
  cadence: Cadence,
  amount: string | null,
  currency: string | undefined,
  categoryName?: string,
  accountName?: string,
): string {
  const money = amount ? formatTargetAmount(amount, currency ?? 'USD') : null;
  const every = CADENCE_PHRASE[cadence];
  if (type === 'EXPENSE') {
    const on = categoryName ? ` on ${categoryName}` : '';
    return money ? `Spend under ${money}${every}${on}` : `Spending limit${on}`;
  }
  if (type === 'INCOME') {
    const from = categoryName ? ` from ${categoryName}` : '';
    return money ? `Earn ${money}${every}${from}` : categoryName ? `Income from ${categoryName}` : 'Income target';
  }
  const into = accountName ? ` in ${accountName}` : '';
  return money ? `Save ${money}${into}` : `Savings${into}`;
}

function cadenceOf(draft: GoalDraft): Cadence {
  return draft.isRecurring ? (draft.recurrenceUnit ?? 'MONTH') : 'ONCE';
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <Text role="alert" className="text-sm text-destructive">
      {message}
    </Text>
  ) : null;
}

/** A field label, with an optional tip beside it. */
function Label({ children, tip, tipLabel = 'What counts' }: { children: string; tip?: string; tipLabel?: string }) {
  return (
    <View className="-my-2 flex-row items-center">
      <Text className="text-sm font-semibold">{children}</Text>
      {tip ? <HelpHint label={tipLabel}>{tip}</HelpHint> : <View className="h-11" />}
    </View>
  );
}

/** A frozen part of a goal being edited: plain text, not a disabled input. */
function Locked({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-1">
      <Text className="text-sm font-semibold">{label}</Text>
      <Text className="text-base text-muted-foreground">{value}</Text>
    </View>
  );
}

function GoalDialogBody({ onOpenChange, goal }: { onOpenChange: (open: boolean) => void; goal?: Goal }) {
  const isEdit = !!goal;
  const { data: accounts } = useAccounts();
  const { accountId: activeAccountId } = useActiveAccount();
  const createMut = useCreateGoal();
  const updateMut = useUpdateGoal();
  const { height } = useWindowDimensions();

  const accountList = writableAccounts(accounts ?? []);
  const [step, setStep] = React.useState<'intent' | 'details'>(isEdit ? 'details' : 'intent');
  const [draft, setDraft] = React.useState<GoalDraft>(() => {
    const initial = initialGoalDraft(goal, activeAccountId, new Date().toISOString().slice(0, 10));
    const fallback = accountList.some((a) => a.id === initial.accountId) ? initial.accountId : (accountList[0]?.id ?? '');
    return isEdit ? initial : { ...initial, accountId: fallback };
  });
  const [errors, setErrors] = React.useState<GoalErrors>({});
  const [pending, setPending] = React.useState(false);
  const [editingStart, setEditingStart] = React.useState(false);
  const nameTouched = React.useRef(isEdit);
  const set = <K extends keyof GoalDraft>(key: K, value: GoalDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  // The account list can arrive after the dialog opens: until one is picked, use the active one, else the first.
  const accountId =
    draft.accountId || (accountList.find((a) => a.id === activeAccountId) ?? accountList[0])?.id || '';
  const account = accountList.find((a) => a.id === accountId) ?? accounts?.find((a) => a.id === accountId);
  const { data: categories } = useCategories('active', draft.type !== 'BALANCE', categoryScope(account));
  const typeCategories = (categories ?? []).filter((c) => c.type === draft.type);
  const category = typeCategories.find((c) => c.id === draft.categoryId) ?? (goal?.categoryId === draft.categoryId ? goal?.category : undefined);
  const cadence = cadenceOf(draft);
  const labels = LABELS[draft.type];
  const intent = INTENTS.find((i) => i.type === draft.type)!;

  // The name follows the choices until the user types their own.
  React.useEffect(() => {
    if (nameTouched.current) return;
    const name = suggestedGoalName(
      draft.type,
      cadence,
      parseMoneyInput(draft.targetAmount),
      account?.currency,
      category?.name,
      account?.name,
    );
    setDraft((d) => (d.name === name ? d : { ...d, name }));
  }, [draft.type, cadence, draft.targetAmount, account?.currency, account?.name, category?.name]);

  function chooseIntent(type: GoalType) {
    setDraft((d) => ({ ...d, type, categoryId: undefined }));
    setStep('details');
  }

  function setCadence(value: Cadence) {
    setDraft((d) =>
      value === 'ONCE'
        ? { ...d, isRecurring: false, recurrenceUnit: undefined }
        : { ...d, isRecurring: true, recurrenceUnit: value },
    );
  }

  async function submit() {
    if (pending) return;
    const tidy = { ...draft, accountId, targetAmount: tidyMoneyText(draft.targetAmount, account?.currency) };
    setDraft(tidy);
    const result = validateGoalDraft(tidy);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      if (goal) await updateMut.mutateAsync({ id: goal.id, name: result.input.name, targetAmount: result.input.targetAmount });
      else await createMut.mutateAsync(result.input);
      onOpenChange(false);
    } catch {
      // The hook already showed the error toast.
    } finally {
      setPending(false);
    }
  }

  const header = (
    <DialogHeader className="flex-row items-center gap-1 border-b border-border px-4 py-3 pr-12">
      {step === 'details' && !isEdit ? (
        <Button variant="ghost" size="icon" className="-ml-2 size-11" accessibilityLabel="Back to goal types" onPress={() => setStep('intent')}>
          <Icon as={ArrowLeft} size={18} className="text-muted-foreground" />
        </Button>
      ) : null}
      <View className="min-w-0 flex-1">
        <DialogTitle>{step === 'intent' ? 'New goal' : isEdit ? `Edit · ${intent.label}` : intent.label}</DialogTitle>
        <DialogDescription className="sr-only">
          {step === 'intent' ? 'Choose what the goal is for.' : 'Set the amount, what it counts and how often it repeats.'}
        </DialogDescription>
      </View>
    </DialogHeader>
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md" style={{ maxHeight: height - 32 }}>
        {header}

        {step === 'intent' ? (
          <View className="gap-2.5 p-4">
            <Text className="mb-1.5 text-xl font-semibold tracking-tight">What&apos;s this goal for?</Text>
            {INTENTS.map(({ type, label, hint, icon, tint }) => (
              <Pressable
                key={type}
                role="button"
                accessibilityLabel={`${label}, ${hint}`}
                onPress={() => chooseIntent(type)}
                className="min-h-[72px] flex-row items-center gap-3.5 rounded-2xl border border-border p-4 active:bg-secondary">
                <View className="size-10 items-center justify-center rounded-xl bg-secondary">
                  <Icon as={icon} size={20} className={tint} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-base font-semibold">{label}</Text>
                  <Text className="text-sm text-muted-foreground">{hint}</Text>
                </View>
                <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
              </Pressable>
            ))}
          </View>
        ) : (
          <>
            <SheetScrollView contentContainerClassName="gap-5 px-4 py-5">
              <View className="gap-1.5">
                <Label>{labels.amount}</Label>
                <MoneyInput
                  value={draft.targetAmount}
                  onChange={(v) => set('targetAmount', v)}
                  currency={account?.currency}
                  invalid={!!errors.targetAmount}
                  accessibilityLabel={labels.amount}
                />
                <FieldError message={errors.targetAmount} />
              </View>

              {labels.category ? (
                isEdit ? (
                  <Locked label={labels.category} value={category?.name ?? goalAllCategoriesLabel(draft.type)} />
                ) : (
                  <View className="gap-1.5">
                    <Label tip={CATEGORY_RULE}>{labels.category}</Label>
                    <PickerField
                      title={labels.category}
                      accessibilityLabel={labels.category}
                      options={categoryOptions(typeCategories)}
                      value={draft.categoryId}
                      onChange={(v) => set('categoryId', v)}
                      placeholder={goalAllCategoriesLabel(draft.type)}
                      emptyOption={goalAllCategoriesLabel(draft.type)}
                    />
                  </View>
                )
              ) : null}

              {isEdit ? (
                <Locked label={labels.account} value={account?.name ?? 'Account'} />
              ) : (
                <View className="gap-1.5">
                  <Label tip={draft.type === 'BALANCE' ? goalRuleHint('BALANCE') : undefined}>{labels.account}</Label>
                  <PickerField
                    title={labels.account}
                    accessibilityLabel={labels.account}
                    options={accountOptions(accountList)}
                    value={accountId || undefined}
                    onChange={(v) => setDraft((d) => ({ ...d, accountId: v ?? '', categoryId: undefined }))}
                    placeholder="Select an account"
                    invalid={!!errors.accountId}
                  />
                  <FieldError message={errors.accountId} />
                </View>
              )}

              {isEdit ? (
                <Locked
                  label={cadence === 'ONCE' ? labels.until : 'Repeats'}
                  value={cadence === 'ONCE' ? (goal?.periodEnd ? formatDate(goal.periodEnd) : '—') : CADENCES.find((c) => c.value === cadence)!.label}
                />
              ) : (
                <View className="gap-1.5">
                  <Label>Repeats</Label>
                  <View role="radiogroup" accessibilityLabel="Repeats" className="flex-row gap-1 rounded-xl bg-muted/60 p-1">
                    {CADENCES.map((c) => {
                      const selected = cadence === c.value;
                      return (
                        <Pressable
                          key={c.value}
                          role="radio"
                          aria-checked={selected}
                          accessibilityLabel={c.label}
                          accessibilityState={{ checked: selected }}
                          onPress={() => setCadence(c.value)}
                          className={cn('min-h-11 flex-1 items-center justify-center rounded-lg', selected && 'bg-card shadow-sm shadow-black/5')}>
                          <Text className={cn('text-sm font-medium', !selected && 'text-muted-foreground')}>{c.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {cadence === 'ONCE' ? (
                    <View className="mt-3 gap-1.5">
                      <Label>{labels.until}</Label>
                      <DateTimeField
                        mode="date"
                        value={draft.periodEnd}
                        onChange={(v) => set('periodEnd', v)}
                        accessibilityLabel={labels.until}
                        initialDate={new Date()}
                        invalid={!!errors.periodEnd}
                      />
                      <FieldError message={errors.periodEnd} />
                    </View>
                  ) : null}

                  {editingStart ? (
                    <View className="mt-3 gap-1.5">
                      <Label>{cadence === 'ONCE' ? 'Starts on' : 'First period starts'}</Label>
                      <DateTimeField
                        mode="date"
                        value={draft.periodStart}
                        onChange={(v) => set('periodStart', v)}
                        accessibilityLabel={cadence === 'ONCE' ? 'Starts on' : 'First period starts'}
                        initialDate={new Date()}
                        invalid={!!errors.periodStart}
                      />
                      <FieldError message={errors.periodStart} />
                    </View>
                  ) : (
                    <View className="flex-row flex-wrap items-center gap-1">
                      <Text className="text-sm text-muted-foreground">Starts {formatDate(`${draft.periodStart}T00:00:00Z`)} ·</Text>
                      <Pressable role="button" accessibilityLabel="Change the start date" onPress={() => setEditingStart(true)} className="min-h-11 justify-center">
                        <Text className="text-sm font-medium text-primary-text">Change</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}

              <View className="gap-1.5 border-t border-border pt-5">
                <Label tip={isEdit ? undefined : 'Written for you from the choices above. Type to change it.'} tipLabel="About the goal name">
                  Goal name
                </Label>
                <Input
                  value={draft.name}
                  onChangeText={(v) => {
                    // Clearing the name hands it back to the automatic one.
                    nameTouched.current = v.trim() !== '';
                    set('name', v);
                  }}
                  placeholder="Name this goal"
                  autoComplete="off"
                  accessibilityLabel="Goal name"
                  returnKeyType="done"
                  className={errors.name ? 'min-h-11 border-destructive' : 'min-h-11'}
                />
                <FieldError message={errors.name} />
              </View>
            </SheetScrollView>

            <View className="flex-row justify-end gap-2 border-t border-border px-4 py-3">
              <Button variant="ghost" className="min-h-11" onPress={() => onOpenChange(false)} accessibilityLabel="Cancel">
                <Text>Cancel</Text>
              </Button>
              <Button className="min-h-11" disabled={pending} aria-busy={pending} onPress={submit}>
                <Text>{pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create goal'}</Text>
              </Button>
            </View>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Mounts the form only while open, so every opening starts from fresh state. */
export function GoalDialog({ open, ...props }: { open: boolean; onOpenChange: (open: boolean) => void; goal?: Goal }) {
  return open ? <GoalDialogBody {...props} /> : null;
}
