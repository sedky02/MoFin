import * as React from 'react';
import { AppState, View } from 'react-native';

import { SettingsSectionCard } from '@/components/settings/settings-card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { Bell } from '@/lib/icons';
import { pushStatus, type PushStatus } from '@/notifications/push-logic';
import { enablePush, pushSupported, readPermission } from '@/notifications/push-registration';

export const NOTIFICATIONS_COPY = {
  description: 'Choose what MoFin sends to this phone.',
  off: 'Notifications are off for MoFin on this phone.',
  blocked: 'Notifications are blocked for MoFin. Allow them in your phone settings.',
  unsupported: 'Notifications are only available in the phone app.',
  mcpDrafts: 'Drafts from connected apps',
  recurring: 'Recurring transactions posted',
} as const;

function usePermissionStatus() {
  const [status, setStatus] = React.useState<PushStatus | undefined>();
  const refresh = React.useCallback(() => {
    readPermission()
      .then((permission) => setStatus(pushStatus(permission)))
      .catch(() => setStatus('off'));
  }, []);
  React.useEffect(() => {
    refresh();
    // Coming back from the phone's settings.
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && refresh());
    return () => subscription.remove();
  }, [refresh]);
  return { status, refresh };
}

function ToggleRow({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (next: boolean) => void }) {
  return (
    <View className="min-h-11 flex-row items-center justify-between gap-3">
      <Text nativeID={`label-${label}`} className="flex-1 text-sm font-medium">
        {label}
      </Text>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-labelledby={`label-${label}`} accessibilityLabel={label} />
    </View>
  );
}

export function NotificationsSection() {
  const prefs = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const { status, refresh } = usePermissionStatus();

  if (!pushSupported) {
    return <SettingsSectionCard icon={Bell} title="Notifications" description={NOTIFICATIONS_COPY.unsupported} />;
  }

  return (
    <SettingsSectionCard icon={Bell} title="Notifications" description={NOTIFICATIONS_COPY.description}>
      {status && status !== 'on' ? (
        <View className="mb-3 gap-2 rounded-lg bg-muted/60 p-3">
          <Text className="text-sm text-muted-foreground">{status === 'blocked' ? NOTIFICATIONS_COPY.blocked : NOTIFICATIONS_COPY.off}</Text>
          <Button
            variant="outline"
            className="min-h-11 self-start"
            accessibilityLabel={status === 'blocked' ? 'Open phone settings' : 'Turn on notifications'}
            onPress={() => void enablePush().then(refresh)}>
            <Text>{status === 'blocked' ? 'Open phone settings' : 'Turn on notifications'}</Text>
          </Button>
        </View>
      ) : null}
      {prefs.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : prefs.data ? (
        <View>
          <ToggleRow
            label={NOTIFICATIONS_COPY.mcpDrafts}
            checked={prefs.data.notifyMcpDrafts}
            disabled={update.isPending}
            onChange={(next) => update.mutate({ notifyMcpDrafts: next })}
          />
          <Separator />
          <ToggleRow
            label={NOTIFICATIONS_COPY.recurring}
            checked={prefs.data.notifyRecurring}
            disabled={update.isPending}
            onChange={(next) => update.mutate({ notifyRecurring: next })}
          />
        </View>
      ) : (
        <Text className="text-sm text-destructive">Could not load your notification choices.</Text>
      )}
    </SettingsSectionCard>
  );
}
