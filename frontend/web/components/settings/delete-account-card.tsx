"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsCard } from "@/components/settings/settings-card";
import { SharedAccountsWarning } from "@/components/settings/shared-accounts-warning";
import { CONFIRM_WORD, TypeToConfirmDialog } from "@/components/settings/type-to-confirm-dialog";
import { authApi } from "@/lib/api";
import type { User } from "@/lib/types";

export function DeleteAccountCard({ user, isLoading }: { user?: User; isLoading: boolean }) {
  const [open, setOpen] = React.useState(false);

  // Nothing to delete by hand: the demo and its sample data go when it ends.
  if (user?.isDemo) {
    return (
      <SettingsCard
        id="delete-account"
        icon={Trash2}
        title="Delete account"
        description="This demo and everything in it are deleted automatically when it ends."
      />
    );
  }

  return (
    <SettingsCard
      id="delete-account"
      icon={Trash2}
      tone="danger"
      title="Delete account"
      description="Permanently deletes your account and everything in it. This can't be undone."
    >
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>your accounts and their balances;</li>
        <li>every transaction, including deleted and recurring ones;</li>
        <li>the categories you created, your goals and pending drafts;</li>
        <li>connected AI apps and every signed-in session.</li>
      </ul>
      <p className="mt-3 text-sm text-muted-foreground">
        Export your data first if you want to keep a copy. To start over but stay signed in, use
        Delete data under Data instead.
      </p>
      <div className="mt-5 flex justify-end">
        {isLoading ? (
          <Skeleton className="h-9 w-36" />
        ) : (
          <Button variant="destructive" onClick={() => setOpen(true)} disabled={!user}>
            Delete account…
          </Button>
        )}
      </div>
      {user && <DeleteAccountDialog open={open} onOpenChange={setOpen} />}
    </SettingsCard>
  );
}

function DeleteAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return (
    <TypeToConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete your account?"
      description="Your account and all of its data will be deleted for good, and you'll be signed out everywhere."
      warning={<SharedAccountsWarning enabled={open} />}
      actionLabel="Delete account"
      pendingText="Deleting…"
      failureMessage="Couldn't delete the account. Please try again."
      // The page is left for /login, so the dialog stays up (and busy) until it goes.
      closeWhenDone={false}
      onConfirm={async () => {
        await authApi.delete("/account", { confirm: CONFIRM_WORD });
        // The session is gone with the account: drop everything cached for it.
        queryClient.clear();
        router.replace("/login?reason=account_deleted");
        router.refresh();
      }}
    />
  );
}
