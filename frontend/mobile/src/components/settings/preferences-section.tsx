import { SlidersHorizontal } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { SubmitButton } from '@/components/auth/submit-button';
import { CurrencyPicker } from '@/components/common/currency-picker';
import { ErrorState } from '@/components/common/states';
import { SettingsSectionCard } from '@/components/settings/settings-card';
import {
  AUTO_CURRENCY,
  currenciesInUse,
  NO_MAIN_ACCOUNT,
  preferencesBody,
  preferencesChanged,
  savedPreferences,
  SETTINGS_COPY,
  type PreferenceValues,
} from '@/components/settings/settings-logic';
import { ThemeSetting } from '@/components/settings/theme-setting';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { handleApiError } from '@/core/form-errors';
import { useAccounts } from '@/hooks/useAccounts';
import { useUpdateUser, useUser } from '@/hooks/useUser';
import { cn } from '@/lib/utils';

/** A radio row with a dot, sized for a thumb. */
function Choice({
  label,
  hint,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      disabled={disabled}
      onPress={onPress}
      className={cn('min-h-12 flex-row items-center gap-3 px-4 py-2.5 active:bg-accent', disabled && 'opacity-50')}>
      <View
        aria-hidden
        className={cn('size-5 items-center justify-center rounded-full border-2', selected ? 'border-primary' : 'border-input')}>
        {selected ? <View className="size-2.5 rounded-full bg-primary" /> : null}
      </View>
      <Text className="min-w-0 flex-1 text-[0.9375rem]">{label}</Text>
      {hint ? (
        <Text className="text-xs text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Preferences: primary currency, default account, and the theme (which applies at once, outside Save). */
export function PreferencesSection() {
  const user = useUser();
  const accounts = useAccounts();
  const update = useUpdateUser();

  const saved = React.useMemo(() => savedPreferences(user.data, accounts.data), [user.data, accounts.data]);
  // Unsaved edits on top of the saved values; null = nothing edited, so the form follows the saved
  // values when they change (loaded, saved, or changed on another device).
  const [draft, setDraft] = React.useState<PreferenceValues | null>(null);
  const values = draft ?? saved;
  const edit = (patch: Partial<PreferenceValues>) => setDraft((d) => ({ ...(d ?? saved), ...patch }));

  const inUse = React.useMemo(() => currenciesInUse(accounts.data), [accounts.data]);
  const changed = preferencesChanged(saved, values);
  const fixedCurrency = values.defaultCurrency !== AUTO_CURRENCY;
  // What the picker shows while "Automatic" is on: the last fixed pick, else a currency in use.
  const [lastFixed, setLastFixed] = React.useState<string | undefined>();
  const pickerValue = fixedCurrency ? values.defaultCurrency : (lastFixed ?? inUse[0] ?? 'USD');

  async function save() {
    try {
      await update.mutateAsync(preferencesBody(user.data, values));
      setDraft(null);
    } catch (err) {
      handleApiError(err, { fallback: 'Could not save settings.' });
    }
  }

  const loading = user.isLoading || accounts.isLoading;

  return (
    <View className="gap-6">
      <SettingsSectionCard icon={SlidersHorizontal} title="Preferences" description={SETTINGS_COPY.preferences}>
        {loading ? (
          <View aria-busy accessibilityLabel="Loading" className="gap-6">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-32 w-full" />
          </View>
        ) : user.isError || !user.data ? (
          <ErrorState description="Couldn't load your preferences." onRetry={() => user.refetch()} />
        ) : (
          <View className="gap-6">
            <View className="gap-2">
              <Text role="heading" aria-level={3} nativeID="currency-label" className="text-sm font-medium">
                Primary currency
              </Text>
              <View role="radiogroup" aria-labelledby="currency-label" className="overflow-hidden rounded-xl border border-border">
                <Choice
                  label="Automatic (most-used currency)"
                  selected={!fixedCurrency}
                  onPress={() => edit({ defaultCurrency: AUTO_CURRENCY })}
                />
                <View className="h-px bg-border" />
                <Choice
                  label="Always this currency"
                  selected={fixedCurrency}
                  onPress={() => edit({ defaultCurrency: pickerValue })}
                />
                <View className="px-4 pb-3">
                  <CurrencyPicker
                    value={pickerValue}
                    pinned={inUse}
                    accessibilityLabel="Primary currency"
                    // Dimmed while Automatic is on: picking a currency switches to it.
                    className={fixedCurrency ? undefined : 'opacity-60'}
                    onChange={(code) => {
                      setLastFixed(code);
                      edit({ defaultCurrency: code });
                    }}
                  />
                </View>
              </View>
              <Text className="text-xs text-muted-foreground">
                Leads the dashboard balance and monthly summary when you have accounts in several currencies.
              </Text>
            </View>

            <View className="gap-2">
              <Text role="heading" aria-level={3} nativeID="main-account-label" className="text-sm font-medium">
                Default account
              </Text>
              <View role="radiogroup" aria-labelledby="main-account-label" className="overflow-hidden rounded-xl border border-border">
                <Choice
                  label="None (all accounts)"
                  selected={values.mainAccountId === NO_MAIN_ACCOUNT}
                  onPress={() => edit({ mainAccountId: NO_MAIN_ACCOUNT })}
                />
                {(accounts.data ?? []).map((a) => (
                  <React.Fragment key={a.id}>
                    <View className="h-px bg-border" />
                    <Choice
                      label={a.name}
                      hint={a.currency}
                      selected={values.mainAccountId === a.id}
                      onPress={() => edit({ mainAccountId: a.id })}
                    />
                  </React.Fragment>
                ))}
              </View>
              <Text className="text-xs text-muted-foreground">
                The dashboard and new transactions start here. Pick another from the account menu at the top any time.
              </Text>
            </View>

            {changed ? (
              <View role="status" className="gap-3 rounded-xl border border-border bg-muted/40 p-3">
                <Text className="text-sm">You have unsaved changes.</Text>
                <SubmitButton pending={update.isPending} pendingText="Saving…" onPress={save}>
                  Save changes
                </SubmitButton>
                <Button variant="ghost" className="h-11 sm:h-11" disabled={update.isPending} onPress={() => setDraft(null)}>
                  <Text>Discard</Text>
                </Button>
              </View>
            ) : null}
          </View>
        )}
      </SettingsSectionCard>

      <View className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/5">
        <ThemeSetting />
      </View>
    </View>
  );
}
