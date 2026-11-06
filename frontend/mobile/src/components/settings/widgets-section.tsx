import { View } from 'react-native';

import { SettingsSectionCard } from '@/components/settings/settings-card';
import { PickerField } from '@/components/transactions/transaction-form-fields';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useAccounts } from '@/hooks/useAccounts';
import { LayoutDashboard } from '@/lib/icons';
import { ALL_ACCOUNTS, type WidgetPeriod } from '@/widgets/summary-data';
import { useWidgetSettings } from '@/widgets/widget-settings';

const PERIODS: { value: WidgetPeriod; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'week', label: 'This week' },
];

export const WIDGETS_COPY = {
  description: 'What your home screen widgets show. Each choice applies to every copy of that widget.',
  refresh:
    "Widgets update when you open MoFin and after you change something in it. Changes made elsewhere, like a draft approved from another app, show the next time MoFin opens. Tap ↻ on a widget to update it now.",
  howToAdd: 'To add one, touch and hold your home screen, tap Widgets, then find MoFin.',
} as const;

/**
 * Settings → Widgets (Android). Android widgets have no settings screen of their own, so the choices
 * live here, one per widget type, kept on this phone.
 */
export function WidgetsSection() {
  const [settings, setSettings] = useWidgetSettings();
  const { data: accounts = [] } = useAccounts();
  const accountOptions = [
    { value: ALL_ACCOUNTS, label: 'All accounts' },
    ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })),
  ];
  // A saved account that is gone shows as All accounts here, as the widget does.
  const accountValue = accounts.some((a) => a.id === settings.summary.accountId) ? settings.summary.accountId : ALL_ACCOUNTS;

  return (
    <SettingsSectionCard icon={LayoutDashboard} title="Widgets" description={WIDGETS_COPY.description}>
      <View className="gap-5">
        <View className="gap-3">
          <Text role="heading" aria-level={3} className="text-sm font-medium">
            Summary
          </Text>
          <Text className="text-sm text-muted-foreground">Balance, income and expenses. Tap it to open the dashboard.</Text>
          <PickerField
            title="Period"
            accessibilityLabel="Summary widget period"
            placeholder="This month"
            options={PERIODS}
            value={settings.summary.period}
            onChange={(v) =>
              setSettings({ ...settings, summary: { ...settings.summary, period: v === 'week' ? 'week' : 'month' } })
            }
          />
          <PickerField
            title="Accounts"
            accessibilityLabel="Summary widget accounts"
            placeholder="All accounts"
            options={accountOptions}
            value={accountValue}
            onChange={(v) => setSettings({ ...settings, summary: { ...settings.summary, accountId: v || ALL_ACCOUNTS } })}
          />
          <Text className="text-xs text-muted-foreground">
            All accounts shows your main currency: amounts in different currencies are never added together.
          </Text>
        </View>

        <Separator />

        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1">
            <Text nativeID="hide-widget-amounts" className="text-sm font-medium">
              Hide amounts in widgets
            </Text>
            <Text className="text-sm text-muted-foreground">Widgets show •••• instead of numbers.</Text>
          </View>
          <Switch
            aria-labelledby="hide-widget-amounts"
            accessibilityLabel="Hide amounts in widgets"
            checked={settings.hideAmounts}
            onCheckedChange={(checked) => setSettings({ ...settings, hideAmounts: checked })}
          />
        </View>

        <Separator />

        <View className="gap-2">
          <Text className="text-sm text-muted-foreground">{WIDGETS_COPY.refresh}</Text>
          <Text className="text-sm text-muted-foreground">{WIDGETS_COPY.howToAdd}</Text>
        </View>
      </View>
    </SettingsSectionCard>
  );
}
