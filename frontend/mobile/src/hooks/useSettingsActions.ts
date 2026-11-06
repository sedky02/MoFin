// The Settings screens' backend calls. The app has no BFF, so each calls the route the web's BFF
// forwards to (see the web's app/api/auth/...).
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/api/client';
import { currentRefreshToken, signOut } from '@/api/session';
import { CONFIRM_WORD } from '@/components/common/type-to-confirm-dialog';
import { saveExport, type SaveOutcome } from '@/components/settings/save-export';
import {
  changePasswordBody,
  exportQuery,
  fallbackExportName,
  filenameFromDisposition,
  type ChangePasswordValues,
  type ExportFormat,
} from '@/components/settings/settings-logic';
import { toast } from '@/lib/toast';

// Deleting a lot of data can take longer than a normal request. A client-side timeout would show
// "too slow" while the server finishes, so these two calls wait longer.
const DESTRUCTIVE_TIMEOUT_MS = 45_000;

export const SETTINGS_TOASTS = {
  passwordChanged: 'Password changed. Other devices were signed out.',
  dataDeleted: 'All your data was deleted.',
  // The web shows these two on its sign-in page (lib/auth-feedback.ts); the app has no login reason
  // for them, so they come as a toast over the sign-in screen.
  signedOutEverywhere: "You've been signed out on every device. Sign in to continue.",
  accountDeleted: 'Your account and its data were deleted.',
} as const;

/**
 * The backend keeps this device's session (the refresh token sent with the request) and revokes
 * every other one; no new tokens come back, so nothing local changes.
 */
export async function changePassword(values: Pick<ChangePasswordValues, 'currentPassword' | 'newPassword'>): Promise<void> {
  await api.post<{ message: string }>('/auth/password/change', changePasswordBody(values, currentRefreshToken()));
  toast.success(SETTINGS_TOASTS.passwordChanged);
}

/**
 * Revokes every refresh token, this device's too, then ends the session here (SecureStore, memory,
 * query cache via onSessionEnd). A refused revoke throws before anything local is touched.
 */
export async function signOutEverywhere(): Promise<void> {
  await api.post<void>('/auth/sessions/revoke-all');
  toast.success(SETTINGS_TOASTS.signedOutEverywhere);
  // signOut's own logout call is best effort; the token it names is already revoked.
  await signOut();
}

export async function deleteAllData(queryClient: QueryClient): Promise<void> {
  await api.post<void>('/users/me/reset-data', { confirm: CONFIRM_WORD }, { timeoutMs: DESTRUCTIVE_TIMEOUT_MS });
  // Every cached balance, list and setting is stale now: start from what the server says.
  await queryClient.resetQueries();
  toast.success(SETTINGS_TOASTS.dataDeleted);
}

/**
 * The backend already deleted the user and sessions, so signOut clears memory, SecureStore and the
 * query cache first and its request may fail without effect.
 */
export async function deleteAccount(): Promise<void> {
  await api.delete<void>('/users/me', { confirm: CONFIRM_WORD }, { timeoutMs: DESTRUCTIVE_TIMEOUT_MS });
  toast.success(SETTINGS_TOASTS.accountDeleted);
  await signOut();
}

export async function exportData(format: ExportFormat): Promise<SaveOutcome> {
  const file = await api.download('/export', exportQuery(format));
  const name = filenameFromDisposition(file.contentDisposition, fallbackExportName(format));
  return saveExport(name, file.text, format);
}

export function useDeleteAllData(): () => Promise<void> {
  const queryClient = useQueryClient();
  return React.useCallback(() => deleteAllData(queryClient), [queryClient]);
}
