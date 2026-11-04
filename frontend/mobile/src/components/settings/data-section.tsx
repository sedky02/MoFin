import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ApiClientError } from '@/api/client';
import { TypeToConfirmDialog } from '@/components/common/type-to-confirm-dialog';
import { SettingsRow, SettingsSectionCard } from '@/components/settings/settings-card';
import { canDeleteData, EXPORT_COPY, EXPORT_FORMATS, type ExportFormat } from '@/components/settings/settings-logic';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { handleApiError } from '@/core/form-errors';
import type { User } from '@/core/types';
import { exportData, useDeleteAllData } from '@/hooks/useSettingsActions';
import { useUser } from '@/hooks/useUser';
import { Database, Download } from '@/lib/icons';
import { toast } from '@/lib/toast';

/** Data: export as JSON or CSV, then (set apart, in red) delete everything and start over. */
export function DataSection() {
  const { data: user, isLoading } = useUser();
  const [pending, setPending] = React.useState<ExportFormat | null>(null);

  async function exportAs(format: ExportFormat) {
    setPending(format);
    try {
      const outcome = await exportData(format);
      if (outcome === 'unavailable') toast.error(EXPORT_COPY.shareUnavailable, { id: 'export-share' });
    } catch (err) {
      // The backend allows a handful of exports an hour per user.
      if (err instanceof ApiClientError && err.status === 429) {
        toast.error(EXPORT_COPY.rateLimited, { id: 'export-429' });
      } else {
        handleApiError(err, { fallback: EXPORT_COPY.failed });
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <SettingsSectionCard icon={Database} title="Data" description={EXPORT_COPY.description}>
      <View className="gap-3">
        {EXPORT_FORMATS.map(({ format, label, title, description }) => (
          <SettingsRow key={format} title={title} description={description}>
            <Button
              variant="outline"
              className="min-h-11 self-start"
              onPress={() => exportAs(format)}
              disabled={pending !== null}
              aria-busy={pending === format}
              accessibilityLabel={label}>
              {pending === format ? <ActivityIndicator size="small" /> : <Icon as={Download} size={16} aria-hidden />}
              <Text>{label}</Text>
            </Button>
          </SettingsRow>
        ))}
        {/* Set apart from the exports: this one is not reversible. */}
        {!user?.isDemo ? (
          <View className="pt-3">
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-destructive">Danger zone</Text>
            <DeleteDataRow user={user} isLoading={isLoading} />
          </View>
        ) : null}
      </View>
    </SettingsSectionCard>
  );
}

/**
 * Deletes everything recorded in MoFin and keeps the account, its sign-ins and its connected AI
 * apps; the user stays signed in. Behind the typed word DELETE, with the web's wording.
 */
export function DeleteDataRow({ user, isLoading }: { user?: User; isLoading: boolean }) {
  const [open, setOpen] = React.useState(false);
  const deleteAllData = useDeleteAllData();

  // A demo's data is sample data that goes when it ends; there is nothing to start over from.
  if (user?.isDemo) return null;

  return (
    <>
      <SettingsRow
        tone="danger"
        title="Delete all data"
        description="Wipes everything you recorded: accounts, transactions, goals and drafts. Keeps your account, your sign-in and your connected AI apps. This can't be undone.">
        {isLoading ? (
          <Skeleton className="min-h-11 w-36" />
        ) : (
          <Button
            variant="outline"
            className="min-h-11 self-start border-destructive/40"
            onPress={() => setOpen(true)}
            disabled={!canDeleteData(user)}
            accessibilityLabel="Delete data…">
            <Text className="text-destructive">Delete data…</Text>
          </Button>
        )}
      </SettingsRow>
      <TypeToConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete all your data?"
        description="Everything you recorded will be deleted for good. Your account, your sign-in and your connected AI apps stay."
        actionLabel="Delete data"
        pendingText="Deleting…"
        failureMessage="Couldn't delete your data. Please try again."
        onConfirm={deleteAllData}
      />
    </>
  );
}
