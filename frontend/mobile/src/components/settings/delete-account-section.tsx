import * as React from 'react';
import { View } from 'react-native';

import { TypeToConfirmDialog } from '@/components/common/type-to-confirm-dialog';
import { SettingsSectionCard } from '@/components/settings/settings-card';
import { canDeleteAccount } from '@/components/settings/settings-logic';
import { SharedAccountsWarning } from '@/components/settings/shared-accounts-warning';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { deleteAccount } from '@/hooks/useSettingsActions';
import { useUser } from '@/hooks/useUser';
import { Trash2 } from '@/lib/icons';

const DELETED = [
  'your accounts and their balances;',
  'every transaction, including deleted and recurring ones;',
  'the categories you created, your goals and pending drafts;',
  'connected AI apps and every signed-in session.',
];

export function DeleteAccountSection() {
  const { data: user, isLoading } = useUser();
  const [open, setOpen] = React.useState(false);

  // Nothing to delete by hand: the demo and its sample data go when it ends.
  if (user?.isDemo) {
    return (
      <SettingsSectionCard
        icon={Trash2}
        title="Delete account"
        description="This demo and everything in it are deleted automatically when it ends."
      />
    );
  }

  return (
    <SettingsSectionCard
      icon={Trash2}
      tone="danger"
      title="Delete account"
      description="Permanently deletes your account and everything in it. This can't be undone.">
      <View role="list" className="gap-1">
        {DELETED.map((line) => (
          <View key={line} role="listitem" className="flex-row gap-2 pl-1">
            <Text aria-hidden className="text-sm text-muted-foreground">
              •
            </Text>
            <Text className="min-w-0 flex-1 text-sm text-muted-foreground">{line}</Text>
          </View>
        ))}
      </View>
      <Text className="mt-3 text-sm text-muted-foreground">
        Export your data first if you want to keep a copy. To start over but stay signed in, use Delete data under Data
        instead.
      </Text>
      <View className="mt-5">
        {isLoading ? (
          <Skeleton className="min-h-11 w-full" />
        ) : (
          <Button
            variant="destructive"
            className="min-h-11"
            onPress={() => setOpen(true)}
            disabled={!canDeleteAccount(user)}
            accessibilityLabel="Delete account…">
            <Text>Delete account…</Text>
          </Button>
        )}
      </View>
      {user ? (
        <TypeToConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Delete your account?"
          description="Your account and all of its data will be deleted for good, and you'll be signed out everywhere."
          warning={<SharedAccountsWarning enabled={open} onLeave={() => setOpen(false)} />}
          actionLabel="Delete account"
          pendingText="Deleting…"
          failureMessage="Couldn't delete the account. Please try again."
          // The session ends on success and sign-in replaces this screen, so the dialog stays up (and busy) until then.
          closeWhenDone={false}
          onConfirm={deleteAccount}
        />
      ) : null}
    </SettingsSectionCard>
  );
}
