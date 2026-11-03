import { safeDeepLinkPath } from '@/lib/deep-links';

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
