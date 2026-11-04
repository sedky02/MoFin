import { backFallbackHref } from '@/lib/back-fallback';

describe('backFallbackHref', () => {
  it('sends an edit page back to its transaction', () => {
    expect(backFallbackHref('transactions/[id]/edit', { id: 'tx-1' })).toEqual({ pathname: '/transactions/[id]', params: { id: 'tx-1' } });
  });

  it('sends a transaction page and the add form to the Transactions tab', () => {
    expect(backFallbackHref('transactions/[id]/index', { id: 'tx-1' })).toBe('/transactions');
    expect(backFallbackHref('transactions/new')).toBe('/transactions');
  });

  it('sends a settings sub-page to Settings, and Settings itself to More', () => {
    expect(backFallbackHref('settings/preferences')).toBe('/settings');
    expect(backFallbackHref('settings/index')).toBe('/more');
  });

  it('sends the More menu pages to More', () => {
    for (const name of ['accounts/index', 'categories/index', 'drafts/index', 'connect/index']) {
      expect(backFallbackHref(name)).toBe('/more');
    }
  });
});
