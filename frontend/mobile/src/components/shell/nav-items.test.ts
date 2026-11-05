import { MORE_GROUPS, MORE_ITEMS, moreSubtitle } from '@/components/shell/nav-items';

describe('More menu', () => {
  it('groups money, the AI assistant and the app, with every route once', () => {
    expect(MORE_GROUPS.map((g) => g.title)).toEqual(['Your money', 'AI assistant', 'App']);
    expect(MORE_ITEMS.map((i) => i.href)).toEqual(['/accounts', '/categories', '/goals', '/ask', '/connect', '/settings']);
  });

  it('shows live counts once they are known', () => {
    expect(moreSubtitle('/accounts', { accounts: 1 })).toBe('1 account');
    expect(moreSubtitle('/accounts', { accounts: 0 })).toBe('Add your first account');
    expect(moreSubtitle('/categories', { categories: 9 })).toBe('9 categories');
    expect(moreSubtitle('/goals', { activeGoals: 2 })).toBe('2 active goals');
    expect(moreSubtitle('/connect', { connectedApps: 1 })).toBe('1 app connected');
  });

  it('explains the screen while counts load or are zero', () => {
    expect(moreSubtitle('/accounts', {})).toBe('Cash, bank, savings, crypto');
    expect(moreSubtitle('/goals', { activeGoals: 0 })).toBe('Save, earn or spend less');
    expect(moreSubtitle('/connect', {})).toBe('Use MoFin from your assistant');
  });
});
