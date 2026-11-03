// The Settings screens' calls to the backend. The mobile app has no BFF, so each one calls the
// backend route the web's BFF route forwards to (frontend/web/app/api/auth/...):
//   change password       POST   /auth/password/change   (web: /api/auth/password/change)
//   sign out everywhere   POST   /auth/sessions/revoke-all (web: /api/auth/sessions/revoke-all)
//   delete all data       POST   /users/me/reset-data    (web: the same, through the proxy)
//   delete account        DELETE /users/me               (web: /api/auth/account)
//   export                GET    /export?format=json|csv
//
// Every function throws on failure and changes nothing locally then: the session is only ended
// after the backend has said yes.
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

export const SETTINGS_TOASTS = {
  passwordChanged: 'Password changed. Other devices were signed out.',
  dataDeleted: 'All your data was deleted.',
  // The web shows these two on its sign-in page (lib/auth-feedback.ts); the app has no login reason
  // for them, so they come as a toast over the sign-in screen.
  signedOutEverywhere: "You've been signed out on every device. Sign in to continue.",
  accountDeleted: 'Your account and its data were deleted.',
} as const;

/**
 * Changes the password. The backend keeps this device's session (the refresh token sent with the
 * request) and revokes every other one. It returns no new tokens, so nothing local changes: the
 * stored refresh token stays valid and keeps rotating as before.
 */
export async function changePassword(values: Pick<ChangePasswordValues, 'currentPassword' | 'newPassword'>): Promise<void> {
  await api.post<{ message: string }>('/auth/password/change', changePasswordBody(values, currentRefreshToken()));
  toast.success(SETTINGS_TOASTS.passwordChanged);
}

/**
 * Revokes every refresh token of the account, this device's too, then ends the session here
 * (SecureStore, memory and, through onSessionEnd, the query cache). The route guard shows sign-in.
 * A refused revoke throws before anything local is touched.
 */
export async function signOutEverywhere(): Promise<void> {
  await api.post<void>('/auth/sessions/revoke-all');
  toast.success(SETTINGS_TOASTS.signedOutEverywhere);
  // signOut's own logout call is best effort; the token it names is already revoked.
  await signOut();
}

/** Deletes everything recorded and keeps the account and its session; every cached query starts over. */
export async function deleteAllData(queryClient: QueryClient): Promise<void> {
  await api.post<void>('/users/me/reset-data', { confirm: CONFIRM_WORD });
  // Every cached balance, list and setting is stale now: start from what the server says.
  await queryClient.resetQueries();
  toast.success(SETTINGS_TOASTS.dataDeleted);
}

/**
 * Deletes the account, then forgets the session on this device. The backend has already deleted
 * the user and its sessions, so nothing here depends on a logout call succeeding: signOut clears
 * memory, SecureStore and the query cache first, and its logout request may fail without effect.
 */
export async function deleteAccount(): Promise<void> {
  await api.delete<void>('/users/me', { confirm: CONFIRM_WORD });
  toast.success(SETTINGS_TOASTS.accountDeleted);
  await signOut();
}

/** Downloads the export and hands it to the share sheet (a browser download on web). */
export async function exportData(format: ExportFormat): Promise<SaveOutcome> {
  const file = await api.download('/export', exportQuery(format));
  const name = filenameFromDisposition(file.contentDisposition, fallbackExportName(format));
  return saveExport(name, file.text, format);
}

/** deleteAllData bound to the app's query client. */
export function useDeleteAllData(): () => Promise<void> {
  const queryClient = useQueryClient();
  return React.useCallback(() => deleteAllData(queryClient), [queryClient]);
}
