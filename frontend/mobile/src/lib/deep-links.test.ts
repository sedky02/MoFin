import { isTransactionId, safeDeepLinkPath } from '@/lib/deep-links';

describe('safeDeepLinkPath', () => {
  it('opens the add form and a transaction detail', () => {
    expect(safeDeepLinkPath('mofin://transactions/new')).toBe('/transactions/new');
    expect(safeDeepLinkPath('/transactions/new')).toBe('/transactions/new');
    expect(safeDeepLinkPath('mofin://transactions/clx123abc')).toBe('/transactions/clx123abc');
    expect(safeDeepLinkPath('/transactions/clx123abc?x=1')).toBe('/transactions/clx123abc');
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

describe('isTransactionId', () => {
  it('accepts plain ids only, so a pasted URL cannot walk the API path', () => {
    expect(isTransactionId('8f14e45f-ceea-467a-9575-4b7fd25cd5c1')).toBe(true);
    for (const bad of ['../users/me', '..%2Fusers%2Fme', 'a/b', '', 'x'.repeat(65), undefined, ['a']]) {
      expect(isTransactionId(bad)).toBe(false);
    }
  });
});
