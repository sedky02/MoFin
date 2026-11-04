import {
  buildSegments,
  currentUtcMonth,
  donutArcs,
  donutDescription,
  monthTitle,
  shiftMonth,
} from '@/components/dashboard/dashboard-logic';

describe('UTC months', () => {
  it('uses the UTC month, not the local one', () => {
    // 2026-11-30 23:30 in UTC-5 is already December in UTC.
    expect(currentUtcMonth(new Date('2026-12-01T04:30:00Z'))).toEqual({ year: 2026, month: 12 });
    expect(currentUtcMonth(new Date('2026-11-30T23:59:59Z'))).toEqual({ year: 2026, month: 11 });
  });
  it('steps back across a year boundary', () => {
    expect(shiftMonth(2026, 1, 1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 3, 14)).toEqual({ year: 2025, month: 1 });
    expect(shiftMonth(2026, 11, 0)).toEqual({ year: 2026, month: 11 });
  });
  it('titles the month in UTC', () => {
    expect(monthTitle(2026, 10, 'en-US')).toBe('October 2026');
  });
});

describe('buildSegments', () => {
  const item = (category: string, amount: string) => ({ category, amount }) as never;
  it('sorts by size, drops zeros and rounds shares', () => {
    const s = buildSegments([item('A', '10.00'), item('B', '30.00'), item('Z', '0.00'), item('C', '60.00')]);
    expect(s.map((x) => x.label)).toEqual(['C', 'B', 'A']);
    expect(s.map((x) => x.share)).toEqual([60, 30, 10]);
    expect(s.map((x) => x.colorIndex)).toEqual([0, 1, 2]);
  });
  it('folds everything past the fourth into Other', () => {
    const s = buildSegments(['5', '4', '3', '2', '1', '1'].map((a, i) => item(`C${i}`, a)));
    expect(s).toHaveLength(5);
    expect(s[4]).toMatchObject({ label: 'Other', amount: '2', colorIndex: -1 });
  });
  it('is empty with nothing recorded', () => {
    expect(buildSegments([])).toEqual([]);
    expect(donutDescription('Spending', [])).toBe('Spending by category: nothing recorded');
  });
  it('describes the donut for screen readers', () => {
    const s = buildSegments([item('Food', '75'), item('Rent', '25')]);
    expect(donutDescription('Spending', s)).toBe('Spending by category: Food 75%, Rent 25%');
  });
});

describe('donutArcs', () => {
  it('lays arcs end to end with a gap, and none for no data', () => {
    expect(donutArcs([0, 0], 100)).toEqual([]);
    const [a, b] = donutArcs([1, 1], 100);
    expect(a).toEqual({ dash: 47, gap: 53, offset: -0 });
    expect(b.offset).toBe(-50);
  });
});
