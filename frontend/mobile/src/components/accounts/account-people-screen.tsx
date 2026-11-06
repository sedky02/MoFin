// Who is on an account: everyone can see it, and the owner manages it from here. The web's
// AccountMembersDialog, as a screen.
import { router, Stack } from 'expo-router';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { HelpHint } from '@/components/common/help-hint';
import { ErrorState, SkeletonCard } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { canManage, memberName, ROLE_HINT, ROLE_LABEL } from '@/core/account-sharing';
import type { AccountMember, AccountMemberRole } from '@/core/types';
import { useAccounts } from '@/hooks/useAccounts';
import {
  useAccountInvitations,
  useAccountMembers,
  useChangeMemberRole,
  useInviteMember,
  useLeaveAccount,
  useRemoveMember,
  useRevokeInvitation,
  useTransferOwnership,
} from '@/hooks/useAccountSharing';
import { Crown, Send, UserMinus, X } from '@/lib/icons';
import { cn } from '@/lib/utils';

const ROLES: AccountMemberRole[] = ['EDITOR', 'VIEWER'];

/** Editor or viewer, side by side: two choices don't need a menu. */
function RolePicker({
  value,
  onChange,
  label,
  disabled,
}: {
  value: AccountMemberRole;
  onChange: (role: AccountMemberRole) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <View role="radiogroup" accessibilityLabel={label} className="flex-row gap-1">
      {ROLES.map((role) => (
        <Button
          key={role}
          size="sm"
          variant={value === role ? 'secondary' : 'ghost'}
          className="min-h-11"
          disabled={disabled}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === role, disabled }}
          onPress={() => value !== role && onChange(role)}>
          <Text className={cn(value !== role && 'text-muted-foreground')}>{ROLE_LABEL[role]}</Text>
        </Button>
      ))}
    </View>
  );
}

function InviteForm({ accountId }: { accountId: string }) {
  const invite = useInviteMember(accountId);
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<AccountMemberRole>('EDITOR');

  function submit() {
    const address = email.trim();
    if (!address) return;
    invite.mutate({ email: address, role }, { onSuccess: () => setEmail('') });
  }

  return (
    <View className="gap-2">
      <Input
        accessibilityLabel="Email to invite"
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={submit}
      />
      <RolePicker value={role} onChange={setRole} label="Role for the invited person" />
      <Button className="min-h-11 gap-2" disabled={invite.isPending || !email.trim()} onPress={submit}>
        <Icon as={Send} size={16} className="text-primary-foreground" aria-hidden />
        <Text>Invite</Text>
      </Button>
    </View>
  );
}

export function AccountPeopleScreen({ accountId }: { accountId: string }) {
  const insets = useSafeAreaInsets();
  const accounts = useAccounts('all');
  const account = accounts.data?.find((a) => a.id === accountId);
  const owner = canManage(account);
  const members = useAccountMembers(accountId);
  const invitations = useAccountInvitations(accountId, !!account && owner);
  const changeRole = useChangeMemberRole(accountId);
  const remove = useRemoveMember(accountId);
  const revoke = useRevokeInvitation(accountId);
  const leave = useLeaveAccount(accountId);
  const transfer = useTransferOwnership(accountId);

  const [toRemove, setToRemove] = React.useState<AccountMember | undefined>();
  const [newOwner, setNewOwner] = React.useState<AccountMember | undefined>();
  const [leaving, setLeaving] = React.useState(false);

  const close = () => router.back();
  const title = <Stack.Screen options={{ title: account?.name ?? 'People' }} />;

  if (members.isLoading || accounts.isLoading) {
    return (
      <View className="flex-1 bg-background p-4">
        {title}
        <SkeletonCard />
      </View>
    );
  }
  if (members.isError || !account) {
    return (
      <View className="flex-1 bg-background p-4">
        {title}
        <ErrorState description="Couldn't load the people on this account." onRetry={() => members.refetch()} />
      </View>
    );
  }

  const pending = invitations.data ?? [];

  return (
    <ScrollView
      className="flex-1 bg-background"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="mx-auto w-full max-w-3xl gap-6 p-4"
      contentContainerStyle={{ paddingBottom: 16 + insets.bottom }}>
      {title}
      <View className="-mb-4 flex-row items-center justify-end">
        <HelpHint label="What the roles mean">{ROLE_HINT}</HelpHint>
      </View>
      <Card className="gap-0 border-0 px-4 py-1">
        {(members.data ?? []).map((member) => (
          <View key={member.userId} className="gap-2 border-b border-border py-3 last:border-b-0">
            <View className="flex-row items-center gap-2">
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-sm font-medium">
                  {memberName(member)}
                  {member.isYou ? <Text className="text-sm text-muted-foreground"> (you)</Text> : null}
                </Text>
                {member.email && member.displayName ? (
                  <Text numberOfLines={1} className="text-xs text-muted-foreground">
                    {member.email}
                  </Text>
                ) : null}
              </View>
              {owner && member.role !== 'OWNER' ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    onPress={() => setNewOwner(member)}
                    accessibilityLabel={`Make ${memberName(member)} the owner`}>
                    <Icon as={Crown} size={16} className="text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    onPress={() => setToRemove(member)}
                    accessibilityLabel={`Remove ${memberName(member)}`}>
                    <Icon as={UserMinus} size={16} className="text-destructive" />
                  </Button>
                </>
              ) : (
                <Text className="text-xs text-muted-foreground">{ROLE_LABEL[member.role]}</Text>
              )}
            </View>
            {owner && member.role !== 'OWNER' ? (
              <RolePicker
                value={member.role}
                label={`Role of ${memberName(member)}`}
                disabled={changeRole.isPending}
                onChange={(role) => changeRole.mutate({ userId: member.userId, role })}
              />
            ) : null}
          </View>
        ))}
      </Card>

      {owner && pending.length > 0 ? (
        <View accessibilityLabel="Pending invitations" className="gap-1">
          <Text role="heading" aria-level={2} className="text-sm font-medium">
            Pending
          </Text>
          {pending.map((invitation) => (
            <View key={invitation.id} className="flex-row items-center gap-2">
              <Text numberOfLines={1} className="min-w-0 flex-1 text-sm">
                {invitation.email}
              </Text>
              <Text className="text-xs text-muted-foreground">{ROLE_LABEL[invitation.role]}</Text>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                disabled={revoke.isPending}
                onPress={() => revoke.mutate(invitation.id)}
                accessibilityLabel={`Revoke the invitation to ${invitation.email}`}>
                <Icon as={X} size={16} className="text-muted-foreground" />
              </Button>
            </View>
          ))}
        </View>
      ) : null}

      {owner && !account.archivedAt ? <InviteForm accountId={accountId} /> : null}

      {!owner ? (
        <Button variant="outline" className="min-h-11" onPress={() => setLeaving(true)}>
          <Text className="text-destructive">Leave account</Text>
        </Button>
      ) : null}

      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(open) => !open && setToRemove(undefined)}
        title={`Remove ${toRemove ? memberName(toRemove) : ''}?`}
        description="They lose access now. Their transactions stay."
        confirmLabel="Remove"
        onConfirm={() => {
          if (toRemove) remove.mutate(toRemove.userId);
          setToRemove(undefined);
        }}
      />
      <ConfirmDialog
        open={!!newOwner}
        onOpenChange={(open) => !open && setNewOwner(undefined)}
        title={`Make ${newOwner ? memberName(newOwner) : ''} the owner?`}
        description="They get full control and you become an editor. You can't undo this."
        confirmLabel="Transfer ownership"
        onConfirm={() => {
          if (newOwner) transfer.mutate(newOwner.userId);
          setNewOwner(undefined);
        }}
      />
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title={`Leave ${account.name}?`}
        description="You lose access now. Your transactions stay."
        confirmLabel="Leave"
        onConfirm={() => {
          leave.mutate(undefined, { onSuccess: close });
          setLeaving(false);
        }}
      />
    </ScrollView>
  );
}
