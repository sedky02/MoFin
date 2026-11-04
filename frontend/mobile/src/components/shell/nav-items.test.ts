import { MORE_GROUPS, MORE_ITEMS, moreSubtitle } from '@/components/shell/nav-items';

describe('More menu', () => {
  it('groups money, the AI assistant and the app, with every route once', () => {
    expect(MORE_GROUPS.map((g) => g.title)).toEqual(['Your money', 'AI assistant', 'App']);
    expect(MORE_ITEMS.map((i) => i.href)).toEqual(['/accounts', '/categories', '/drafts', '/connect', '/settings']);
  });

  it('shows live counts once they are known', () => {
    expect(moreSubtitle('/accounts', { accounts: 1 })).toBe('1 account · balances and types');
    expect(moreSubtitle('/accounts', { accounts: 0 })).toBe('Add your first account');
    expect(moreSubtitle('/categories', { categories: 9 })).toBe('9 categories · icons and colours');
    expect(moreSubtitle('/drafts', { pendingDrafts: 2 })).toBe('2 drafts to review');
    expect(moreSubtitle('/connect', { connectedApps: 1 })).toBe('1 app connected · manage in Settings');
  });

  it('explains the screen while counts load or are zero', () => {
    expect(moreSubtitle('/accounts', {})).toBe('Cash, bank, savings and crypto');
    expect(moreSubtitle('/drafts', { pendingDrafts: 0 })).toMatch(/MoFin drafts it, you approve/);
    expect(moreSubtitle('/connect', {})).toMatch(/suggest transactions/);
  });
});
