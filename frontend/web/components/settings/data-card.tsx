"use client";

import * as React from "react";
import { Database, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DeleteDataRow } from "@/components/settings/delete-data-row";
import { SettingsCard, SettingsRow } from "@/components/settings/settings-card";
import { ApiClientError } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { handleApiError } from "@/lib/form-errors";
import type { User } from "@/lib/types";

type Format = "json" | "csv";

const FORMATS: { format: Format; label: string; title: string; description: string }[] = [
  {
    format: "json",
    label: "Export JSON",
    title: "Everything, as JSON",
    description: "Accounts with opening balances, categories, transactions and goals. Best for a backup.",
  },
  {
    format: "csv",
    label: "Export CSV",
    title: "Transactions, as CSV",
    description: "One row per transaction line, signed from the account's side. Opens in Excel or Sheets.",
  },
];

/** Settings card that downloads everything the user has in MoFin, or deletes it and starts over. */
export function DataCard({ user, isLoading }: { user?: User; isLoading: boolean }) {
  const [pending, setPending] = React.useState<Format | null>(null);

  async function exportAs(format: Format) {
    setPending(format);
    try {
      await downloadFile(`/api/backend/export?format=${format}`, `mofin-export.${format}`);
    } catch (err) {
      // The backend allows a handful of exports an hour per user.
      if (err instanceof ApiClientError && err.status === 429) {
        toast.error("You've exported several times this hour. Try again later.", { id: "export-429" });
      } else {
        handleApiError(err, { fallback: "Couldn't export your data. Please try again." });
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <SettingsCard
      id="data"
      icon={Database}
      title="Data"
      description="Download your accounts, categories, transactions and goals (deleted transactions are left out), or delete it all and start over."
    >
      <div className="space-y-3">
        {FORMATS.map(({ format, label, title, description }) => (
          <SettingsRow key={format} title={title} description={description}>
            <Button
              variant="outline"
              onClick={() => exportAs(format)}
              disabled={pending !== null}
              aria-busy={pending === format}
            >
              {pending === format ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
              {label}
            </Button>
          </SettingsRow>
        ))}
        {/* Set apart from the exports: this one is not reversible. */}
        <div className="pt-3">
          {!user?.isDemo && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-destructive">Danger zone</p>
          )}
          <DeleteDataRow user={user} isLoading={isLoading} />
        </div>
      </div>
    </SettingsCard>
  );
}
