import { router, Stack } from 'expo-router';
import * as React from 'react';
import { BackHandler, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { selectableOnDashboard } from '@/core/account-privacy';
import type { Goal } from '@/core/types';
import { useAccounts } from '@/hooks/useAccounts';
import { useGoals } from '@/hooks/useGoals';
import { Check } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { MAX_WIDGET_GOALS, toggleGoal } from '@/widgets/goals-data';
import { ALL_ACCOUNTS, type WidgetName } from '@/widgets/summary-data';
import { useWidgetSettings, type WidgetSettings } from '@/widgets/widget-settings';
import { requestWidgetSync } from '@/widgets/widget-sync';

/** Saving waits this long at most for the widgets to update before going back to the home screen. */
const DONE_WAIT_MS = 8_000;

export const WIDGET_SETUP_COPY: Record<WidgetName, { title: string; intro: string }> = {
  WeeklySummary: {
    title: 'This week widget',
    intro: "Choose the account it shows. Money in and out are this week's; the balance is today's.",
  },
  MonthlySummary: {
    title: 'This month widget',
    intro: "Choose the account it shows. Money in and out are this month's; the balance is today's.",
  },
  Goals: { title: 'Goals widget', intro: `Choose up to ${MAX_WIDGET_GOALS} goals to follow.` },
};

const GOAL_TYPE: Record<Goal['type'], string> = { BALANCE: 'Balance', INCOME: 'Income', EXPENSE: 'Spending cap' };

function Row({
  role,
  label,
  hint,
  selected,
  disabled,
  onPress,
}: {
  role: 'radio' | 'checkbox';
  label: string;
  hint?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      role={role}
      aria-checked={selected}
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn('min-h-14 flex-row items-center gap-3 px-4 py-3 active:bg-accent', disabled && 'opacity-40')}>
      {role === 'radio' ? (
        <View
          aria-hidden
          className={cn('size-5 items-center justify-center rounded-full border-2', selected ? 'border-primary' : 'border-input')}>
          {selected ? <View className="size-2.5 rounded-full bg-primary" /> : null}
        </View>
      ) : (
        <View
          aria-hidden
          className={cn(
            'size-5 items-center justify-center rounded-md border-2',
            selected ? 'border-primary bg-primary' : 'border-input',
          )}>
          {selected ? <Icon as={Check} size={14} className="text-primary-foreground" /> : null}
        </View>
      )}
      <Text numberOfLines={1} className="min-w-0 flex-1 text-[0.9375rem]">
        {label}
      </Text>
      {hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
    </Pressable>
  );
}

/**
 * Opened by the launcher when a widget is added (mofin://widget-setup?widget=…) or reconfigured.
 * The widget already shows defaults; Done saves the choice and goes home.
 */
export function WidgetSetup({ widget }: { widget: WidgetName }) {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useWidgetSettings();
  const [draft, setDraft] = React.useState<WidgetSettings | null>(null);
  const [saving, setSaving] = React.useState(false);
  const accounts = useAccounts();
  const goals = useGoals();
  const values = draft ?? settings;
  const copy = WIDGET_SETUP_COPY[widget];
  const edit = (next: Partial<WidgetSettings>) => setDraft({ ...values, ...next });

  async function done() {
    if (saving) return;
    setSaving(true);
    setSettings(values);
    await Promise.race([requestWidgetSync('settings'), new Promise((r) => setTimeout(r, DONE_WAIT_MS))]);
    // Back to the home screen, where the widget is, as Android's own widget setups do.
    if (Platform.OS === 'android') BackHandler.exitApp();
    else router.replace('/dashboard');
  }

  const accountList = selectableOnDashboard(accounts.data ?? []);
  const goalList = goals.data ?? [];
  const picked = values.Goals.goalIds.filter((id) => goalList.some((g) => g.id === id));

  return (
    <>
      <Stack.Screen options={{ title: copy.title }} />
      <View className="flex-1 bg-background">
        <ScrollView className="flex-1" contentContainerClassName="mx-auto w-full max-w-2xl gap-6 p-4">
          <Text className="text-[0.9375rem] text-muted-foreground">{copy.intro}</Text>

          {widget === 'Goals' ? (
            <View className="gap-2">
              <View className="flex-row items-baseline justify-between px-1">
                <Text role="heading" aria-level={2} nativeID="widget-goals" className="text-sm font-medium">
                  Goals
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {picked.length} of {MAX_WIDGET_GOALS}
                </Text>
              </View>
              {goals.isLoading ? (
                <Text className="px-1 text-sm text-muted-foreground">Loading your goals…</Text>
              ) : goalList.length === 0 ? (
                <View className="gap-3 rounded-xl border border-border p-4">
                  <Text className="text-sm">You have no goals yet. The widget will ask you to choose once you set one.</Text>
                  <Button variant="outline" className="min-h-11 self-start" onPress={() => router.push('/goals')}>
                    <Text>Set a goal</Text>
                  </Button>
                </View>
              ) : (
                <View aria-labelledby="widget-goals" className="overflow-hidden rounded-xl border border-border bg-card">
                  {goalList.map((g, i) => (
                    <React.Fragment key={g.id}>
                      {i > 0 ? <View className="h-px bg-border" /> : null}
                      <Row
                        role="checkbox"
                        label={g.name}
                        hint={GOAL_TYPE[g.type]}
                        selected={picked.includes(g.id)}
                        disabled={!picked.includes(g.id) && picked.length >= MAX_WIDGET_GOALS}
                        onPress={() => edit({ Goals: { goalIds: toggleGoal(picked, g.id) } })}
                      />
                    </React.Fragment>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View className="gap-2">
              <Text role="heading" aria-level={2} nativeID="widget-account" className="px-1 text-sm font-medium">
                Account
              </Text>
              <View role="radiogroup" aria-labelledby="widget-account" className="overflow-hidden rounded-xl border border-border bg-card">
                <Row
                  role="radio"
                  label="All accounts"
                  hint="Main currency"
                  selected={!accountList.some((a) => a.id === values[widget].accountId)}
                  onPress={() => edit({ [widget]: { accountId: ALL_ACCOUNTS } })}
                />
                {accountList.map((a) => (
                  <React.Fragment key={a.id}>
                    <View className="h-px bg-border" />
                    <Row
                      role="radio"
                      label={a.name}
                      hint={a.currency}
                      selected={values[widget].accountId === a.id}
                      onPress={() => edit({ [widget]: { accountId: a.id } })}
                    />
                  </React.Fragment>
                ))}
              </View>
              <Text className="px-1 text-xs text-muted-foreground">
                All accounts leaves out private and hidden accounts, and never adds different currencies together.
              </Text>
            </View>
          )}

          {widget !== 'Goals' ? (
            <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <View className="min-w-0 flex-1">
                <Text nativeID="widget-hide-amounts" className="text-[0.9375rem]">
                  Hide amounts
                </Text>
                <Text className="text-xs text-muted-foreground">Show •••• instead of numbers in every MoFin widget.</Text>
              </View>
              <Switch
                aria-labelledby="widget-hide-amounts"
                accessibilityLabel="Hide amounts in widgets"
                checked={values.hideAmounts}
                onCheckedChange={(checked) => edit({ hideAmounts: checked })}
              />
            </View>
          ) : null}

          <Text className="px-1 text-xs text-muted-foreground">
            This applies to every copy of this widget. To change it later, touch and hold the widget and tap the pencil
            (Android 12 and later).
          </Text>
        </ScrollView>

        <View className="border-t border-border px-4 pt-3" style={{ paddingBottom: 12 + insets.bottom }}>
          <Button size="lg" className="min-h-12" disabled={saving} aria-busy={saving} onPress={() => void done()}>
            <Text>{saving ? 'Updating widget…' : 'Done'}</Text>
          </Button>
        </View>
      </View>
    </>
  );
}
