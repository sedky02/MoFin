"use client";

import { Apple, Download, Smartphone } from "lucide-react";
import { HelpHint } from "@/components/common/help-hint";
import { SettingsCard } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppRelease } from "@/hooks/useAppRelease";
import { APK_INSTALL_HINT, releaseLabel } from "@/lib/app-release";

/** Where to get the phone app and what changed in the newest build. */
export function MobileAppCard() {
  const { data, isLoading } = useAppRelease();
  const android = data?.android;

  return (
    <SettingsCard
      id="mobile-app"
      icon={Smartphone}
      title="Mobile app"
      description="Install MoFin on your phone. Download again here whenever there's a new version."
      action={android ? <HelpHint label="How to install">{APK_INSTALL_HINT}</HelpHint> : undefined}
    >
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-9 w-48 rounded-lg" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 rounded-xl bg-muted/40 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">Android</p>
              <p className="text-sm text-muted-foreground tabular">
                {android ? releaseLabel(android) : "Not available to download yet."}
              </p>
            </div>
            {android && (
              <Button asChild className="gap-1.5">
                <a href={android.url} download>
                  <Download className="size-4" aria-hidden />
                  Download
                </a>
              </Button>
            )}
          </div>

          {android && android.notes.length > 0 && (
            <div>
              <p className="text-sm font-medium">What&apos;s new</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {android.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Apple className="size-4" aria-hidden />
              iPhone · Coming soon
            </span>
            {android?.legacyUrl && (
              <a href={android.legacyUrl} download className="underline underline-offset-4 hover:text-foreground">
                Older Android phone? Get this version
              </a>
            )}
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
