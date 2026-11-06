import {
  canChangePassword,
  canDeleteAccount,
  canDeleteData,
  canSignOutEverywhere,
  changePasswordBody,
  changePasswordSchema,
  currenciesInUse,
  emailShown,
  EXPORT_FILE_TYPES,
  EXPORT_FORMATS,
  exportQuery,
  fallbackExportName,
  filenameFromDisposition,
  preferencesBody,
  preferencesChanged,
  profileChanged,
  profileSchema,
  savedPreferences,
  securityMode,
  SETTINGS_SECTIONS,
  settingsSections,
} from '@/components/settings/settings-logic';
import type { Account, User } from '@/core/types';

const user = (over: Partial<User> = {}): User => ({
  id: 'u1',
  email: 'alex@example.com',
  displayName: 'Alex',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  hasPassword: true,
  ...over,
});
const account = (id: string, currency = 'EUR') => ({ id, name: id, currency }) as Account;

describe('sections', () => {
  it('lists the web sections in its page order', () => {
    expect(SETTINGS_SECTIONS.map((s) => s.id)).toEqual([
      'profile',
      'preferences',
      'security',
      'connected-apps',
      'data',
      'delete-account',
    ]);
    expect(SETTINGS_SECTIONS.map((s) => s.href)).toEqual(SETTINGS_SECTIONS.map((s) => `/settings/${s.id}`));
  });

  it('keeps every section for a demo, but its delete row is not red and says it goes by itself', () => {
    const demo = settingsSections(user({ isDemo: true }));
    expect(demo).toHaveLength(SETTINGS_SECTIONS.length);
    const del = demo.find((s) => s.id === 'delete-account')!;
    expect(del.tone).toBeUndefined();
    expect(del.summary).toMatch(/automatically/);
    expect(settingsSections(user()).find((s) => s.id === 'delete-account')!.tone).toBe('danger');
  });

  it('shows a placeholder instead of a demo’s generated email', () => {
    expect(emailShown(user({ isDemo: true, email: 'demo-123@demo.mofin.app' }))).toBe('Temporary demo account');
    expect(emailShown(user())).toBe('alex@example.com');
    expect(emailShown(undefined)).toBe('');
  });
});

describe('profile', () => {
  it('trims the name and caps it at 80 characters', () => {
    expect(profileSchema.parse({ displayName: '  Sam  ' })).toEqual({ displayName: 'Sam' });
    expect(profileSchema.safeParse({ displayName: 'x'.repeat(81) }).success).toBe(false);
  });

  it('counts only a real change (surrounding spaces are not one)', () => {
    expect(profileChanged(user(), ' Alex ')).toBe(false);
    expect(profileChanged(user(), 'Sam')).toBe(true);
    expect(profileChanged(user({ displayName: null }), '')).toBe(false);
  });
});

describe('preferences', () => {
  it('reads "auto" and "none" when nothing is saved, and "none" for an archived main account', () => {
    expect(savedPreferences(user(), [account('a1')])).toEqual({ defaultCurrency: 'auto', mainAccountId: 'none' });
    const u = user({ settings: { defaultCurrency: 'TND', mainAccountId: 'gone' } });
    expect(savedPreferences(u, [account('a1')])).toEqual({ defaultCurrency: 'TND', mainAccountId: 'none' });
    expect(savedPreferences(user({ settings: { mainAccountId: 'a1' } }), [account('a1')]).mainAccountId).toBe('a1');
  });

  it('merges into the other settings and drops the keys set to auto / none', () => {
    const u = user({ settings: { defaultCurrency: 'EUR', mainAccountId: 'a1', other: 1 } });
    expect(preferencesBody(u, { defaultCurrency: 'TND', mainAccountId: 'a2' })).toEqual({
      settings: { other: 1, defaultCurrency: 'TND', mainAccountId: 'a2' },
    });
    expect(preferencesBody(u, { defaultCurrency: 'auto', mainAccountId: 'none' })).toEqual({ settings: { other: 1 } });
  });

  it('knows when there is something to save', () => {
    const saved = { defaultCurrency: 'auto', mainAccountId: 'none' };
    expect(preferencesChanged(saved, { ...saved })).toBe(false);
    expect(preferencesChanged(saved, { ...saved, mainAccountId: 'a1' })).toBe(true);
  });

  it('offers the currencies in use first, once each', () => {
    expect(currenciesInUse([account('a', 'TND'), account('b', 'EUR'), account('c', 'TND')])).toEqual(['TND', 'EUR']);
    expect(currenciesInUse(undefined)).toEqual([]);
  });
});

describe('security', () => {
  it('offers the password form only to an account that has a password, never to a demo', () => {
    expect(securityMode(undefined, true)).toBe('loading');
    expect(securityMode(user(), false)).toBe('password');
    // hasPassword missing (an older backend) still counts as having one, as on the web.
    expect(securityMode(user({ hasPassword: undefined }), false)).toBe('password');
    expect(securityMode(user({ hasPassword: false }), false)).toBe('google');
    expect(securityMode(user({ isDemo: true }), false)).toBe('demo');

    expect(canChangePassword('password')).toBe(true);
    expect(canChangePassword('google')).toBe(false);
    expect(canChangePassword('demo')).toBe(false);
    expect(canSignOutEverywhere('password')).toBe(true);
    expect(canSignOutEverywhere('google')).toBe(true);
    expect(canSignOutEverywhere('demo')).toBe(false);
  });

  it('validates the change-password form like the web', () => {
    const ok = { currentPassword: 'old', newPassword: 'Abcdef1!', confirmPassword: 'Abcdef1!' };
    expect(changePasswordSchema.safeParse(ok).success).toBe(true);
    const short = changePasswordSchema.safeParse({ ...ok, newPassword: 'short', confirmPassword: 'short' });
    expect(short.success).toBe(false);
    const mismatch = changePasswordSchema.safeParse({ ...ok, confirmPassword: 'Abcdef1?' });
    expect(mismatch.error?.issues[0]).toMatchObject({ path: ['confirmPassword'], message: "The passwords don't match." });
  });

  it("names this device's session in the change so it stays signed in", () => {
    expect(changePasswordBody({ currentPassword: 'a', newPassword: 'b' }, 'rt')).toEqual({
      currentPassword: 'a',
      newPassword: 'b',
      refreshToken: 'rt',
    });
    expect(changePasswordBody({ currentPassword: 'a', newPassword: 'b' }, undefined)).toEqual({
      currentPassword: 'a',
      newPassword: 'b',
    });
  });
});

describe('danger zone', () => {
  it('is closed to demos and to an unknown user', () => {
    expect(canDeleteData(user())).toBe(true);
    expect(canDeleteAccount(user())).toBe(true);
    expect(canDeleteData(user({ isDemo: true }))).toBe(false);
    expect(canDeleteAccount(user({ isDemo: true }))).toBe(false);
    expect(canDeleteData(undefined)).toBe(false);
    expect(canDeleteAccount(undefined)).toBe(false);
  });
});

describe('export', () => {
  it('offers JSON then CSV, each asking the backend for its own format', () => {
    expect(EXPORT_FORMATS.map((f) => [f.format, f.label])).toEqual([
      ['json', 'Export JSON'],
      ['csv', 'Export CSV'],
    ]);
    expect(exportQuery('csv')).toEqual({ format: 'csv' });
    expect(EXPORT_FILE_TYPES.json.mimeType).toBe('application/json');
    expect(EXPORT_FILE_TYPES.csv).toEqual({ mimeType: 'text/csv', uti: 'public.comma-separated-values-text' });
  });

  it("takes the backend's filename, in every Content-Disposition form", () => {
    const fb = fallbackExportName('csv');
    expect(fb).toBe('mofin-export.csv');
    expect(filenameFromDisposition('attachment; filename="mofin-export-2026-11-03.csv"', fb)).toBe(
      'mofin-export-2026-11-03.csv',
    );
    expect(filenameFromDisposition('attachment; filename=mofin.json', fb)).toBe('mofin.json');
    expect(filenameFromDisposition(`attachment; filename="a.csv"; filename*=UTF-8''r%C3%A9sum%C3%A9.csv`, fb)).toBe(
      'résumé.csv',
    );
  });

  it('falls back when the header is missing or unusable, and never leaves the folder', () => {
    const fb = fallbackExportName('json');
    expect(filenameFromDisposition(null, fb)).toBe('mofin-export.json');
    expect(filenameFromDisposition('attachment', fb)).toBe('mofin-export.json');
    expect(filenameFromDisposition('attachment; filename=""', fb)).toBe('mofin-export.json');
    expect(filenameFromDisposition('attachment; filename=".."', fb)).toBe('mofin-export.json');
    expect(filenameFromDisposition('attachment; filename="../../etc/passwd"', fb)).toBe('.._.._etc_passwd');
    expect(filenameFromDisposition(`attachment; filename*=UTF-8''%E0%A4%A`, fb)).toBe('mofin-export.json');
  });
});
