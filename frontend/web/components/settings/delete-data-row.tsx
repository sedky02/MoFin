"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsRow } from "@/components/settings/settings-card";
import { SharedAccountsWarning } from "@/components/settings/shared-accounts-warning";
import { CONFIRM_WORD, TypeToConfirmDialog } from "@/components/settings/type-to-confirm-dialog";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

/**
 * Deletes everything recorded and keeps the account, sign-ins and connected AI apps. Red because it
 * can't be undone, but kept with the data it deletes; the account's own card stays the louder one.
 */
export function DeleteDataRow({ user, isLoading }: { user?: User; isLoading: boolean }) {
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  // A demo's data is sample data that goes when it ends; there is nothing to start over from.
  if (user?.isDemo) return null;

  return (
    <>
      <SettingsRow
        tone="danger"
        title="Delete all data"
        description="Wipes everything you recorded: accounts, transactions, goals and drafts. Keeps your account, your sign-in and your connected AI apps. This can't be undone."
      >
        {isLoading ? (
          <Skeleton className="h-9 w-32" />
        ) : (
          <Button
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setOpen(true)}
            disabled={!user}
          >
            Delete data…
          </Button>
        )}
      </SettingsRow>
      <TypeToConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete all your data?"
        description="Everything you recorded will be deleted for good. Your account, your sign-in and your connected AI apps stay."
        warning={<SharedAccountsWarning enabled={open} />}
        actionLabel="Delete data"
        pendingText="Deleting…"
        failureMessage="Couldn't delete your data. Please try again."
        onConfirm={async () => {
          await api.post("/users/me/reset-data", { confirm: CONFIRM_WORD });
          // Every cached balance, list and setting is stale now: start from what the server says.
          await queryClient.resetQueries();
          toast.success("All your data was deleted.");
        }}
      />
    </>
  );
}
