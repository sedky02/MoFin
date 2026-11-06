// Rules and copy apart from the components so they test as plain functions; mirrors the web's
// settings, with the web's copy unless a comment says otherwise.
import type { LucideIcon } from 'lucide-react-native';
import { z } from 'zod';

import { MIN_PASSWORD_LENGTH } from '@/core/password-strength';
import type { Account, User } from '@/core/types';
import { Database, Plug, ShieldCheck, SlidersHorizontal, Trash2, User as UserIcon } from '@/lib/icons';

// ─── Sections ────────────────────────────────────────────────────────────────

export type SettingsSectionId = 'profile' | 'preferences' | 'security' | 'connected-apps' | 'data' | 'delete-account';

export type SettingsSection = {
  id: SettingsSectionId;
  label: string;
  /** One line under the label in the Settings list (mobile only: the web shows every card on one page). */
  summary: string;
  href: `/settings/${SettingsSectionId}`;
  icon: LucideIcon;
  tone?: 'danger';
};

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: 'profile', label: 'Profile', summary: 'Name and email', href: '/settings/profile', icon: UserIcon },
  {
    id: 'preferences',
    label: 'Preferences',
    summary: 'Currency, default account, theme',
    href: '/settings/preferences',
    icon: SlidersHorizontal,
  },
  { id: 'security', label: 'Security', summary: 'Password and devices', href: '/settings/security', icon: ShieldCheck },
  {
    id: 'connected-apps',
    label: 'Connected AI apps',
    summary: 'Claude, ChatGPT and others',
    href: '/settings/connected-apps',
    icon: Plug,
  },
  { id: 'data', label: 'Data', summary: 'Export or delete', href: '/settings/data', icon: Database },
  {
    id: 'delete-account',
    label: 'Delete account',
    summary: 'Delete for good',
    href: '/settings/delete-account',
    icon: Trash2,
    tone: 'danger',
  },
];

/**
 * A demo keeps every section, as on the web, but its Security and Delete account rows read as
 * information, not actions. The summaries are mobile-only list text.
 */
export function settingsSections(user: User | undefined): SettingsSection[] {
  return SETTINGS_SECTIONS.map((s) => {
    if (!user?.isDemo) return s;
    if (s.id === 'security') return { ...s, summary: 'Not available in the demo' };
    if (s.id === 'delete-account') return { ...s, summary: 'Deleted automatically when the demo ends', tone: undefined };
    if (s.id === 'data') return { ...s, summary: 'Export as JSON or CSV' };
    return s;
  });
}

export const SETTINGS_COPY = {
  title: 'Settings',
  description: 'Manage your profile, preferences and security.',
  profile: "Your email can't be changed yet.",
  preferences: 'Currency, default account and theme.',
  demoEmail: 'Temporary demo account',
  noDisplayName: 'No display name yet',
} as const;

/** What the Email field shows: a demo's address is a generated placeholder, so say what it is instead. */
export function emailShown(user: User | undefined): string {
  return user?.isDemo ? SETTINGS_COPY.demoEmail : (user?.email ?? '');
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export const profileSchema = z.object({
  displayName: z.string().trim().max(80, 'Keep it under 80 characters.'),
});
export type ProfileValues = z.infer<typeof profileSchema>;

export function profileChanged(user: User | undefined, displayName: string): boolean {
  return (user?.displayName ?? '') !== displayName.trim();
}

export function avatarLetter(displayName: string, user: User | undefined): string {
  return (displayName.trim() || user?.email || '?').charAt(0).toUpperCase();
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export const AUTO_CURRENCY = 'auto';
export const NO_MAIN_ACCOUNT = 'none';

export type PreferenceValues = { defaultCurrency: string; mainAccountId: string };

/**
 * The saved preferences as form values. A saved main account that was archived or deleted reads as
 * "none", so Save isn't offered for a no-op (same rule as the web).
 */
export function savedPreferences(user: User | undefined, accounts: Account[] | undefined): PreferenceValues {
  const mainId = user?.settings?.mainAccountId;
  return {
    defaultCurrency: user?.settings?.defaultCurrency || AUTO_CURRENCY,
    mainAccountId: mainId && accounts?.some((a) => a.id === mainId) ? mainId : NO_MAIN_ACCOUNT,
  };
}

export function preferencesChanged(saved: PreferenceValues, current: PreferenceValues): boolean {
  return saved.defaultCurrency !== current.defaultCurrency || saved.mainAccountId !== current.mainAccountId;
}

/**
 * The PATCH /users/me body for new preferences. The API replaces `settings` wholesale, so every
 * other setting is carried over; "auto" and "none" drop their key.
 */
export function preferencesBody(user: User | undefined, values: PreferenceValues): { settings: Record<string, unknown> } {
  const { defaultCurrency: _currency, mainAccountId: _main, ...other } = user?.settings ?? {};
  void _currency;
  void _main;
  return {
    settings: {
      ...other,
      ...(values.defaultCurrency !== AUTO_CURRENCY ? { defaultCurrency: values.defaultCurrency } : {}),
      ...(values.mainAccountId !== NO_MAIN_ACCOUNT ? { mainAccountId: values.mainAccountId } : {}),
    },
  };
}

export function currenciesInUse(accounts: Account[] | undefined): string[] {
  return [...new Set((accounts ?? []).map((a) => a.currency))];
}

// ─── Security ────────────────────────────────────────────────────────────────

export type SecurityMode = 'loading' | 'demo' | 'google' | 'password';

/** What the Security section offers: a demo has no password, a Google-only account none to change. */
export function securityMode(user: User | undefined, isLoading: boolean): SecurityMode {
  if (isLoading || !user) return 'loading';
  if (user.isDemo) return 'demo';
  if (user.hasPassword === false) return 'google';
  return 'password';
}

export const SECURITY_COPY: Record<Exclude<SecurityMode, 'loading'>, string> = {
  demo: "The demo has no password, and its one session ends with the demo. Create your own account to set a password and manage where you're signed in.",
  google:
    "You sign in with Google, so there's no MoFin password to change. Your Google account's own security settings protect this sign-in.",
  // The web says "This one stays signed in" (the browser); on a phone it is the device.
  password: 'Changing your password signs out every other device. This one stays signed in.',
};

/** Change password is offered only to an account that has one (never a demo). */
export function canChangePassword(mode: SecurityMode): boolean {
  return mode === 'password';
}

export function canSignOutEverywhere(mode: SecurityMode): boolean {
  return mode === 'password' || mode === 'google';
}

// Same rule as register and reset (the backend checks it too).
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH, 'Use at least 8 characters.'),
    confirmPassword: z.string().min(1, 'Repeat the new password.'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: "The passwords don't match.",
  });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

/**
 * The POST /auth/password/change body. The backend keeps the session whose refresh token it is
 * given and revokes every other one; without it this device would be signed out too.
 */
export function changePasswordBody(
  values: Pick<ChangePasswordValues, 'currentPassword' | 'newPassword'>,
  refreshToken: string | undefined,
): { currentPassword: string; newPassword: string; refreshToken?: string } {
  return {
    currentPassword: values.currentPassword,
    newPassword: values.newPassword,
    ...(refreshToken ? { refreshToken } : {}),
  };
}

// ─── Danger zone ─────────────────────────────────────────────────────────────

export function canDeleteData(user: User | undefined): boolean {
  return !!user && !user.isDemo;
}

export function canDeleteAccount(user: User | undefined): boolean {
  return !!user && !user.isDemo;
}

// ─── Export ──────────────────────────────────────────────────────────────────

export type ExportFormat = 'json' | 'csv';

export const EXPORT_FORMATS: readonly { format: ExportFormat; label: string; title: string; description: string }[] = [
  {
    format: 'json',
    label: 'Export JSON',
    title: 'Everything, as JSON',
    description: 'Accounts with opening balances, categories, transactions and goals. Best for a backup.',
  },
  {
    format: 'csv',
    label: 'Export CSV',
    title: 'Transactions, as CSV',
    description: "One row per transaction line, signed from the account's side. Opens in Excel or Sheets.",
  },
];

export const EXPORT_FILE_TYPES: Record<ExportFormat, { mimeType: string; uti: string }> = {
  json: { mimeType: 'application/json', uti: 'public.json' },
  csv: { mimeType: 'text/csv', uti: 'public.comma-separated-values-text' },
};

export function fallbackExportName(format: ExportFormat): string {
  return `mofin-export.${format}`;
}

/**
 * Same rules as the web's lib/download.ts: quoted, bare and RFC 5987 `filename*=` (which wins);
 * path separators are replaced so a header can't escape the export folder.
 */
export function filenameFromDisposition(header: string | null | undefined, fallback: string): string {
  if (!header) return fallback;
  let name: string | undefined;
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (extended) {
    try {
      name = decodeURIComponent(extended[1].trim());
    } catch {
      name = undefined;
    }
  }
  if (!name) {
    const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/.exec(header);
    name = (plain?.[1] ?? plain?.[2])?.trim();
  }
  const safe = name?.replace(/[/\\]/g, '_');
  if (!safe || /^\.+$/.test(safe)) return fallback;
  return safe;
}

export function exportQuery(format: ExportFormat): { format: ExportFormat } {
  return { format };
}

export const EXPORT_COPY = {
  description:
    'Download your accounts, categories, transactions and goals (deleted transactions are left out), or delete it all and start over.',
  rateLimited: "You've exported several times this hour. Try again later.",
  failed: "Couldn't export your data. Please try again.",
  // Mobile only: the web always has a browser download to fall back on.
  shareUnavailable: "Sharing isn't available on this device.",
} as const;
