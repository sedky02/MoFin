import {
  buildChips,
  clearChip,
  EMPTY_FILTERS,
  groupsByDay,
  hasActiveFilters,
  pageSummary,
  panelFilterCount,
  sortOrDefault,
  toSearchParams,
  type ListFilters,
} from './transactions-list-model';

const f = (over: Partial<ListFilters>): ListFilters => ({ ...EMPTY_FILTERS, ...over });

describe('toSearchParams', () => {
  it('sends nothing but the limit for empty filters', () => {
    expect(toSearchParams(EMPTY_FILTERS, 25)).toEqual({
      q: undefined,
      categoryId: undefined,
      accountId: undefined,
      from: undefined,
      to: undefined,
      minAmount: undefined,
      maxAmount: undefined,
      type: undefined,
      recurrence: undefined,
      sort: undefined,
      limit: 25,
    });
  });

  it('maps every filter to the search endpoint', () => {
    expect(
      toSearchParams(
        f({ q: 'rent', categoryId: 'c1', accountId: 'a1', from: '2026-01-01', to: '2026-01-31', minAmount: '5', maxAmount: '100', type: 'EXPENSE', recurrence: 'recurring', sort: 'amount-desc' }),
        10,
      ),
    ).toEqual({ q: 'rent', categoryId: 'c1', accountId: 'a1', from: '2026-01-01', to: '2026-01-31', minAmount: '5', maxAmount: '100', type: 'EXPENSE', recurrence: 'recurring', sort: 'amount-desc', limit: 10 });
  });

  it('reads amounts as dot decimals and drops what cannot be read', () => {
    expect(toSearchParams(f({ minAmount: '1,234', maxAmount: '12,5' }), 25)).toMatchObject({ minAmount: '1234', maxAmount: '12.5' });
    expect(toSearchParams(f({ minAmount: 'abc' }), 25).minAmount).toBeUndefined();
  });

  it('never sends an unknown type or recurrence, and omits the default sort', () => {
    const p = toSearchParams(f({ type: 'BOGUS', recurrence: 'series', sort: 'newest' }), 25);
    expect(p.type).toBeUndefined();
    expect(p.recurrence).toBeUndefined();
    expect(p.sort).toBeUndefined();
  });
});

describe('counts and chips', () => {
  it('counts the sheet filters, a date range and an amount range as one each', () => {
    expect(panelFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(panelFilterCount(f({ type: 'INCOME', from: '2026-01-01', to: '2026-02-01', minAmount: '1', maxAmount: '2', sort: 'oldest' }))).toBe(4);
    expect(panelFilterCount(f({ q: 'x', accountId: 'a', categoryId: 'c' }))).toBe(0);
  });

  it('treats a non-default sort as an active filter', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters(f({ sort: 'amount-asc' }))).toBe(true);
    expect(hasActiveFilters(f({ minAmount: 'abc' }))).toBe(false);
    expect(hasActiveFilters(f({ q: 'x' }))).toBe(true);
  });

  it('builds one chip per filter and clears exactly its fields', () => {
    const filters = f({ type: 'TRANSFER', from: '2026-01-01', minAmount: '5', sort: 'oldest', accountId: 'a1' });
    const chips = buildChips(filters, [{ id: 'a1', name: 'Old', archivedAt: '2026-01-01' } as never]);
    expect(chips.map((c) => c.label)).toEqual(['Old (archived)', 'Transfer', expect.stringMatching(/^From /), 'At least 5', 'Oldest first']);
    const dates = chips.find((c) => c.key === 'dates')!;
    expect(clearChip(filters, dates)).toEqual({ ...filters, from: '', to: '' });
    expect(clearChip(filters, chips.find((c) => c.key === 'sort')!).sort).toBe('newest');
  });
});

describe('small helpers', () => {
  it('groups by day only for date sorts', () => {
    expect(groupsByDay('newest')).toBe(true);
    expect(groupsByDay('oldest')).toBe(true);
    expect(groupsByDay('amount-desc')).toBe(false);
  });
  it('falls back to the default sort', () => {
    expect(sortOrDefault('nope')).toBe('newest');
    expect(sortOrDefault('amount-asc')).toBe('amount-asc');
  });
  it('summarises the page', () => {
    expect(pageSummary(2, 25, 25, 80)).toBe('26–50 of 80');
    expect(pageSummary(1, 25, 1, 1)).toBe('1 of 1');
    expect(pageSummary(3, 25, 0)).toBe('Page 3');
  });
});
