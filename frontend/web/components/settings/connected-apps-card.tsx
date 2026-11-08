"use client";

import { HelpHint } from "@/components/common/help-hint";
import * as React from "react";
import Link from "next/link";
import { Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConnectorLogo } from "@/components/common/connector-logo";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { SettingsCard } from "@/components/settings/settings-card";
import { useConnectedApps, useDisconnectApp } from "@/hooks/useConnectedApps";
import type { ConnectedApp } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ConnectedAppsCard() {
  const apps = useConnectedApps();
  const disconnect = useDisconnectApp();
  const [toDisconnect, setToDisconnect] = React.useState<ConnectedApp | undefined>();

  return (
    <SettingsCard
      id="connected-apps"
      title="Connected AI apps"
      icon={Plug}
      description="Apps you've approved to read your data and suggest transactions."
      action={
        <div className="flex items-center gap-1">
          <HelpHint label="What disconnecting does">
            A disconnected app can&apos;t renew its access. A session it already holds can keep working for up to 15 minutes.
          </HelpHint>
          <Button variant="outline" size="sm" asChild>
            <Link href="/connect">Connect an app</Link>
          </Button>
        </div>
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
            No apps connected yet. Connect Claude or ChatGPT to ask about your money.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {apps.data.map((app) => (
            <li key={app.clientId} className="flex items-center gap-3 p-3">
              <ConnectorLogo clientName={app.clientName} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{app.clientName ?? "Unnamed app"}</p>
                <Badge variant="outline" className={cn("mt-1 gap-1.5", app.active ? "border-success/30 bg-success/10 text-success" : "text-muted-foreground")}>
                  <span aria-hidden className={cn("size-1.5 rounded-full", app.active ? "bg-success" : "bg-muted-foreground/50")} />
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
