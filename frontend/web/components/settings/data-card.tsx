"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/settings-card";
import { ApiClientError } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { handleApiError } from "@/lib/form-errors";

type Format = "json" | "csv";

const FORMATS: { format: Format; label: string }[] = [
  { format: "json", label: "Export JSON" },
  { format: "csv", label: "Export CSV" },
];

/** Settings card that downloads everything the user has in MoFin. */
export function DataCard() {
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
      title="Data"
      description="Download your accounts, categories, transactions and goals. Deleted transactions are left out."
    >
      <div className="flex flex-wrap gap-2">
        {FORMATS.map(({ format, label }) => (
          <Button
            key={format}
            variant="outline"
            onClick={() => exportAs(format)}
            disabled={pending !== null}
            aria-busy={pending === format}
          >
            {pending === format ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
            {label}
          </Button>
        ))}
      </div>
    </SettingsCard>
  );
}
