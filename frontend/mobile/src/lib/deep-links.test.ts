import { INVITATION_PATH, inviteToken, isTransactionId, safeDeepLinkPath, widgetScreen } from '@/lib/deep-links';

describe('safeDeepLinkPath', () => {
  it('opens the add form and a transaction detail', () => {
    expect(safeDeepLinkPath('mofin://transactions/new')).toBe('/transactions/new');
    expect(safeDeepLinkPath('/transactions/new')).toBe('/transactions/new');
    expect(safeDeepLinkPath('mofin://transactions/clx123abc')).toBe('/transactions/clx123abc');
    expect(safeDeepLinkPath('/transactions/clx123abc?x=1')).toBe('/transactions/clx123abc');
  });

  it('opens the drafts inbox, which a push notification links to', () => {
    expect(safeDeepLinkPath('/drafts')).toBe('/drafts');
    expect(safeDeepLinkPath('mofin://drafts')).toBe('/drafts');
    expect(safeDeepLinkPath('/drafts/anything')).toBe('/');
  });

  it('opens the screens home screen widgets link to', () => {
    expect(safeDeepLinkPath('mofin://dashboard')).toBe('/dashboard');
    expect(safeDeepLinkPath('mofin://goals')).toBe('/goals');
    expect(safeDeepLinkPath('/dashboard?x=1')).toBe('/dashboard');
  });

  it("turns a widget's refresh link into the refresh route, back to an allowed screen only", () => {
    expect(safeDeepLinkPath('mofin://refresh?to=dashboard')).toBe('/widget-refresh?to=dashboard');
    expect(safeDeepLinkPath('mofin://refresh?to=goals')).toBe('/widget-refresh?to=goals');
    for (const to of ['settings/delete-account', '%2Fsettings', 'constructor', '__proto__', '']) {
      expect(safeDeepLinkPath(`mofin://refresh?to=${to}`)).toBe('/widget-refresh?to=dashboard');
    }
    expect(safeDeepLinkPath('mofin://refresh')).toBe('/widget-refresh?to=dashboard');
    expect(safeDeepLinkPath('mofin://refresh/settings')).toBe('/');
  });

  it("opens a new widget's setup screen, for MoFin's widgets only", () => {
    expect(safeDeepLinkPath('mofin://widget-setup?widget=WeeklySummary')).toBe('/widget-setup?widget=WeeklySummary');
    expect(safeDeepLinkPath('mofin://widget-setup?widget=Goals')).toBe('/widget-setup?widget=Goals');
    for (const w of ['', 'Summary', 'goals', '../settings', 'Goals%2F..']) {
      expect(safeDeepLinkPath(`mofin://widget-setup?widget=${w}`)).toBe('/');
    }
  });

  it('sends everything else home, including screens that act or edit', () => {
    for (const p of [
      '',
      '/',
      'mofin://settings/delete-account',
      '/settings/data',
      '/transactions/clx123/edit',
      '/transactions/a/b',
      '/_dev/kitchen-sink',
      '/transactions/..%2Fsettings',
      '/transactions/<script>',
      'mofin://reset-password?token=abc',
    ]) {
      expect(safeDeepLinkPath(p)).toBe('/');
    }
  });
});

describe('widgetScreen', () => {
  it('only names the screens widgets open', () => {
    expect(widgetScreen('goals')).toBe('goals');
    expect(widgetScreen('toString')).toBe('dashboard');
    expect(widgetScreen(undefined)).toBe('dashboard');
  });
});

describe('isTransactionId', () => {
  it('accepts plain ids only, so a pasted URL cannot walk the API path', () => {
    expect(isTransactionId('8f14e45f-ceea-467a-9575-4b7fd25cd5c1')).toBe(true);
    for (const bad of ['../users/me', '..%2Fusers%2Fme', 'a/b', '', 'x'.repeat(65), undefined, ['a']]) {
      expect(isTransactionId(bad)).toBe(false);
    }
  });
});

describe('invitation links', () => {
  const token = 'abcDEF123_-abcDEF123_-abcDEF123_-abcDEF12345';

  it('opens the invitation screen and hands over the token', () => {
    const link = `mofin://invitations?token=${token}`;
    expect(safeDeepLinkPath(link)).toBe(INVITATION_PATH);
    expect(inviteToken(link)).toBe(token);
  });

  it('goes home for a link with no usable token', () => {
    expect(safeDeepLinkPath('mofin://invitations')).toBe('/');
    expect(safeDeepLinkPath('mofin://invitations?token=short')).toBe('/');
    expect(safeDeepLinkPath('mofin://invitations?token=%3Cscript%3E%3Cscript%3E%3Cscript%3E')).toBe('/');
  });

  it('never opens anything deeper under the path', () => {
    expect(safeDeepLinkPath(`mofin://invitations/accept?token=${token}`)).toBe('/');
  });
});
