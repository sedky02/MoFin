import { Link } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { SettingsSectionCard } from '@/components/settings/settings-card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import type { ConnectedApp } from '@/core/types';
import { useConnectedApps, useDisconnectApp } from '@/hooks/useConnectedApps';
import { Plug } from '@/lib/icons';
import { cn } from '@/lib/utils';

/** The AI apps the user approved, each with its state and a Disconnect button (the web's ConnectedAppsCard). */
export function ConnectedAppsSection() {
  const apps = useConnectedApps();
  const disconnect = useDisconnectApp();
  const [toDisconnect, setToDisconnect] = React.useState<ConnectedApp | undefined>();

  return (
    <SettingsSectionCard
      icon={Plug}
      title="Connected AI apps"
      description="Apps you've approved to read your data and suggest transactions. Disconnecting stops an app from renewing access; a session it already holds can keep working for up to 15 minutes."
      action={
        <Link href="/connect" asChild>
          <Button variant="outline" role="link" className="min-h-11 self-start">
            <Text>Connect an app</Text>
          </Button>
        </Link>
      }>
      {apps.isLoading ? (
        <Skeleton aria-busy accessibilityLabel="Loading" className="h-14 w-full" />
      ) : apps.isError ? (
        <Text role="alert" className="text-sm text-destructive">
          Couldn&apos;t load connected apps.
        </Text>
      ) : !apps.data?.length ? (
        <View className="flex-row items-center gap-3 rounded-xl border border-dashed border-border p-4">
          <Icon as={Plug} size={20} aria-hidden className="text-muted-foreground" />
          <Text className="min-w-0 flex-1 text-sm text-muted-foreground">
            No apps connected. Connect Claude, ChatGPT or another assistant to ask about your money and have it suggest
            transactions for your approval.
          </Text>
        </View>
      ) : (
        <View className="overflow-hidden rounded-xl border border-border">
          {apps.data.map((app, i) => {
            const name = app.clientName ?? 'Unnamed app';
            const busy = disconnect.isPending && disconnect.variables === app.clientId;
            return (
              <React.Fragment key={app.clientId}>
                {i > 0 ? <Separator /> : null}
                <View className={cn('flex-row items-center gap-3 p-3', busy && 'opacity-60')}>
                  <View aria-hidden className="size-10 items-center justify-center rounded-lg bg-muted">
                    <Text className="text-base font-semibold text-muted-foreground">{name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-sm font-medium">
                      {name}
                    </Text>
                    <View
                      className={cn(
                        'mt-1 flex-row items-center gap-1.5 self-start rounded-md border px-2 py-0.5',
                        app.active ? 'border-success/30 bg-success/10' : 'border-border',
                      )}>
                      <View aria-hidden className={cn('size-1.5 rounded-full', app.active ? 'bg-success' : 'bg-muted-foreground/50')} />
                      <Text className={cn('text-xs font-medium', app.active ? 'text-success' : 'text-muted-foreground')}>
                        {app.active ? 'Active' : 'Signed out'}
                      </Text>
                    </View>
                  </View>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={busy}
                    accessibilityLabel={`Disconnect ${app.clientName ?? 'this app'}`}
                    onPress={() => setToDisconnect(app)}>
                    <Text>Disconnect</Text>
                  </Button>
                </View>
              </React.Fragment>
            );
          })}
        </View>
      )}

      <ConfirmDialog
        open={!!toDisconnect}
        onOpenChange={(o) => !o && setToDisconnect(undefined)}
        title={`Disconnect ${toDisconnect?.clientName ?? 'this app'}?`}
        description="It will lose access and have to ask for your approval again to reconnect."
        confirmLabel="Disconnect"
        destructive
        onConfirm={() => {
          if (toDisconnect) disconnect.mutate(toDisconnect.clientId);
          setToDisconnect(undefined);
        }}
      />
    </SettingsSectionCard>
  );
}
