"use client";

import * as React from "react";
import Link from "next/link";
import { Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { SettingsCard } from "@/components/settings/settings-card";
import { useConnectedApps, useDisconnectApp } from "@/hooks/useConnectedApps";
import type { ConnectedApp } from "@/lib/types";

/** The AI apps the user approved, each with its state and a Disconnect button. */
export function ConnectedAppsCard() {
  const apps = useConnectedApps();
  const disconnect = useDisconnectApp();
  const [toDisconnect, setToDisconnect] = React.useState<ConnectedApp | undefined>();

  return (
    <SettingsCard
      id="connected-apps"
      title="Connected AI apps"
      description="Apps you've approved to read your data and suggest transactions. Disconnecting stops an app from renewing access; a session it already holds can keep working for up to 15 minutes."
      action={
        <Button variant="outline" size="sm" asChild>
          <Link href="/connect">Connect an app</Link>
        </Button>
      }
    >
      {apps.isLoading ? (
        <Skeleton className="h-14 w-full" />
      ) : apps.isError ? (
        <p className="text-sm text-destructive">Couldn&apos;t load connected apps.</p>
      ) : !apps.data?.length ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4">
          <Plug className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            No apps connected. Connect Claude, ChatGPT or another assistant to ask about your money and have it
            suggest transactions for your approval.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {apps.data.map((app) => (
            <li key={app.clientId} className="flex items-center gap-3 p-3">
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary-text"
              >
                {(app.clientName ?? "?").charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{app.clientName ?? "Unnamed app"}</p>
                <Badge variant={app.active ? "secondary" : "outline"} className="mt-1">
                  {app.active ? "Active" : "Signed out"}
                </Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Disconnect ${app.clientName ?? "this app"}`}
                onClick={() => setToDisconnect(app)}
              >
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!toDisconnect}
        onOpenChange={(o) => !o && setToDisconnect(undefined)}
        title={`Disconnect ${toDisconnect?.clientName ?? "this app"}?`}
        description="It will lose access and have to ask for your approval again to reconnect."
        confirmLabel="Disconnect"
        destructive
        onConfirm={() => {
          if (toDisconnect) disconnect.mutate(toDisconnect.clientId);
          setToDisconnect(undefined);
        }}
      />
    </SettingsCard>
  );
}
