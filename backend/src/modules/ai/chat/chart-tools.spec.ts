import {
  categoryDonut,
  dailyTrend,
  incomeVsExpensesBars,
  MAX_DONUT_SLICES,
} from './chart-tools';

describe('categoryDonut', () => {
  it('sorts the biggest first and leaves out empty categories', () => {
    const chart = categoryDonut(
      [
        { category: 'Food', amount: '120.50' },
        { category: 'Gifts', amount: '0' },
        { category: 'Rent', amount: '800' },
      ],
      'Spending',
      'TND',
      'expense',
    );
    expect(chart.labels).toEqual(['Rent', 'Food']);
    expect(chart.series[0].values).toEqual(['800', '120.50']);
  });

  it(`groups everything past ${MAX_DONUT_SLICES - 1} slices as Other, summed exactly`, () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({
      category: `C${i}`,
      amount: `${(9 - i) * 10}.1`,
    }));
    const chart = categoryDonut(rows, 'Spending', 'TND', 'expense');
    expect(chart.labels).toHaveLength(MAX_DONUT_SLICES);
    expect(chart.labels.at(-1)).toBe('Other');
    // C5..C8: 40.1 + 30.1 + 20.1 + 10.1
    expect(chart.series[0].values.at(-1)).toBe('100.4');
  });

  it('keeps a single leftover as itself rather than "Other"', () => {
    const rows = Array.from({ length: MAX_DONUT_SLICES }, (_, i) => ({
      category: `C${i}`,
      amount: String(100 - i),
    }));
    const chart = categoryDonut(rows, 'Spending', 'TND', 'expense');
    expect(chart.labels).not.toContain('Other');
    expect(chart.labels).toHaveLength(MAX_DONUT_SLICES);
  });
});

describe('incomeVsExpensesBars', () => {
  it('draws income and expenses per month', () => {
    const chart = incomeVsExpensesBars(
      [{ month: '2026-10', income: '1000', expenses: '700' }],
      'TND',
    );
    expect(chart).toMatchObject({
      kind: 'bar',
      axis: 'month',
      labels: ['2026-10'],
    });
    expect(chart.series.map((s) => [s.tone, s.values])).toEqual([
      ['income', ['1000']],
      ['expense', ['700']],
    ]);
  });
});

describe('dailyTrend', () => {
  const points = [
    { date: '2026-11-01', income: '0', expenses: '12', balance: '500' },
    { date: '2026-11-02', income: '50', expenses: '0', balance: '550' },
  ];

  it('draws a balance as a line and flows as bars', () => {
    expect(dailyTrend(points, 'balance', 'TND').kind).toBe('line');
    expect(dailyTrend(points, 'expenses', 'TND').kind).toBe('bar');
    expect(dailyTrend(points, 'income', 'TND').series[0].values).toEqual([
      '0',
      '50',
    ]);
  });
});
