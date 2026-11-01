"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eraser } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsCard } from "@/components/settings/settings-card";
import { CONFIRM_WORD, TypeToConfirmDialog } from "@/components/settings/type-to-confirm-dialog";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

/** Deletes everything recorded in MoFin and keeps the account, its sign-ins and its connected AI apps. */
export function DeleteDataCard({ user, isLoading }: { user?: User; isLoading: boolean }) {
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  // A demo's data is sample data that goes when it ends; there is nothing to start over from.
  if (user?.isDemo) return null;

  return (
    <SettingsCard
      id="delete-data"
      icon={Eraser}
      tone="danger"
      title="Delete data"
      description="Permanently deletes everything you recorded and keeps your account. This can't be undone."
    >
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>your accounts and their balances;</li>
        <li>every transaction, including deleted and recurring ones;</li>
        <li>your goals, your pending drafts and the categories you created (the starter set comes back).</li>
      </ul>
      <p className="mt-3 text-sm text-muted-foreground">
        You stay signed in, and your profile, settings and connected AI apps stay as they are. Export your data first
        if you want to keep a copy.
      </p>
      <div className="mt-5 flex justify-end">
        {isLoading ? (
          <Skeleton className="h-9 w-36" />
        ) : (
          <Button variant="destructive" onClick={() => setOpen(true)} disabled={!user}>
            Delete data…
          </Button>
        )}
      </div>
      <TypeToConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete all your data?"
        description="Everything you recorded will be deleted for good. Your account, your sign-in and your connected AI apps stay."
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
    </SettingsCard>
  );
}
