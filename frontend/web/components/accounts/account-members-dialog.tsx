"use client";

import * as React from "react";
import { Crown, Send, UserMinus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { HelpHint } from "@/components/common/help-hint";
import {
  useAccountInvitations,
  useAccountMembers,
  useChangeMemberRole,
  useInviteMember,
  useLeaveAccount,
  useRemoveMember,
  useRevokeInvitation,
  useTransferOwnership,
} from "@/hooks/useAccountSharing";
import { canManage, memberName, ROLE_HINT, ROLE_LABEL } from "@/lib/account-sharing";
import type { Account, AccountMember, AccountMemberRole } from "@/lib/types";

function RoleSelect({
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
    <Select value={value} onValueChange={(v) => onChange(v as AccountMemberRole)} disabled={disabled}>
      <SelectTrigger className="w-28" size="sm" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="EDITOR">{ROLE_LABEL.EDITOR}</SelectItem>
        <SelectItem value="VIEWER">{ROLE_LABEL.VIEWER}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function InviteForm({ accountId }: { accountId: string }) {
  const invite = useInviteMember(accountId);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<AccountMemberRole>("EDITOR");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await invite
      .mutateAsync({ email: email.trim(), role })
      .then(() => setEmail(""))
      .catch(() => undefined);
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor="invite-email" className="block text-sm font-medium">
        Invite
      </label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="invite-email"
          type="email"
          required
          autoComplete="off"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-44 flex-1"
        />
        <RoleSelect value={role} onChange={setRole} label="Role for the invited person" />
        <Button type="submit" disabled={invite.isPending} className="gap-2">
          <Send className="size-4" aria-hidden />
          Invite
        </Button>
      </div>
    </form>
  );
}

export function AccountMembersDialog({
  account,
  onClose,
}: {
  account: Account | undefined;
  onClose: () => void;
}) {
  const accountId = account?.id ?? "";
  const owner = canManage(account);
  const members = useAccountMembers(account?.id);
  const invitations = useAccountInvitations(account?.id, owner);
  const changeRole = useChangeMemberRole(accountId);
  const remove = useRemoveMember(accountId);
  const revoke = useRevokeInvitation(accountId);
  const leave = useLeaveAccount(accountId);
  const transfer = useTransferOwnership(accountId);

  const [toRemove, setToRemove] = React.useState<AccountMember | undefined>();
  const [newOwner, setNewOwner] = React.useState<AccountMember | undefined>();
  const [leaving, setLeaving] = React.useState(false);

  const pending = invitations.data ?? [];
  const archived = !!account?.archivedAt;

  return (
    <>
      <Dialog open={!!account} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="sm:max-w-lg"
          // Focus the dialog, not its first control: on the info icon that would open the tooltip.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 text-base">
              <span className="truncate">{account?.name}</span>
              <HelpHint label="What the roles mean">{ROLE_HINT}</HelpHint>
            </DialogTitle>
            <DialogDescription className="sr-only">People on this account</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {members.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <ul className="divide-y divide-border">
                {(members.data ?? []).map((member) => (
                  <li key={member.userId} className="flex flex-wrap items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {memberName(member)}
                        {member.isYou && <span className="font-normal text-muted-foreground"> (you)</span>}
                      </p>
                      {member.email && member.displayName && (
                        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                      )}
                    </div>
                    {owner && member.role !== "OWNER" ? (
                      <>
                        <RoleSelect
                          value={member.role}
                          label={`Role of ${memberName(member)}`}
                          disabled={changeRole.isPending}
                          onChange={(role) => changeRole.mutate({ userId: member.userId, role })}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                          onClick={() => setNewOwner(member)}
                          aria-label={`Make ${memberName(member)} the owner`}
                          title="Make owner"
                        >
                          <Crown className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setToRemove(member)}
                          aria-label={`Remove ${memberName(member)}`}
                          title="Remove"
                        >
                          <UserMinus className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">{ROLE_LABEL[member.role]}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {owner && pending.length > 0 && (
              <section aria-label="Pending invitations">
                <h3 className="mb-1 text-sm font-medium">Pending</h3>
                <ul className="divide-y divide-border">
                  {pending.map((invitation) => (
                    <li key={invitation.id} className="flex items-center gap-2 py-2">
                      <p className="min-w-0 flex-1 truncate text-sm">{invitation.email}</p>
                      <span className="text-xs text-muted-foreground">{ROLE_LABEL[invitation.role]}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground"
                        disabled={revoke.isPending}
                        onClick={() => revoke.mutate(invitation.id)}
                        aria-label={`Revoke the invitation to ${invitation.email}`}
                        title="Revoke"
                      >
                        <X className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {owner && !archived && account && <InviteForm accountId={account.id} />}

            {!owner && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setLeaving(true)}
                >
                  Leave account
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(open) => !open && setToRemove(undefined)}
        title={`Remove ${toRemove ? memberName(toRemove) : ""}?`}
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
        title={`Make ${newOwner ? memberName(newOwner) : ""} the owner?`}
        description="They get full control and you become an editor. You can't undo this."
        confirmLabel="Transfer ownership"
        onConfirm={() => {
          if (newOwner) transfer.mutate(newOwner.userId, { onSuccess: onClose });
          setNewOwner(undefined);
        }}
      />
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title={`Leave ${account?.name}?`}
        description="You lose access now. Your transactions stay."
        confirmLabel="Leave"
        onConfirm={() => {
          leave.mutate(undefined, { onSuccess: onClose });
          setLeaving(false);
        }}
      />
    </>
  );
}
