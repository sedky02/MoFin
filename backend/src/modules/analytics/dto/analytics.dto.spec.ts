import {
  dailySeriesQuerySchema,
  monthlySummaryQuerySchema,
} from './analytics.dto';

describe('monthlySummaryQuerySchema', () => {
  it('requires currency when accountId is absent', () => {
    const result = monthlySummaryQuerySchema.safeParse({
      year: '2026',
      month: '10',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['currency'] }),
    ]);
  });

  it('accepts an all-accounts request that names a currency', () => {
    expect(
      monthlySummaryQuerySchema.parse({
        year: '2026',
        month: '10',
        currency: 'TND',
      }),
    ).toEqual(
      expect.objectContaining({ year: 2026, month: 10, currency: 'TND' }),
    );
  });

  it('accepts an account-scoped request without a currency', () => {
    expect(
      monthlySummaryQuerySchema.safeParse({
        year: '2026',
        month: '10',
        accountId: 'acc-1',
      }).success,
    ).toBe(true);
  });
});

describe('dailySeriesQuerySchema', () => {
  it('defaults to 7 days in UTC', () => {
    expect(
      dailySeriesQuerySchema.parse({ from: '2026-11-02', currency: 'TND' }),
    ).toEqual({
      from: '2026-11-02',
      days: 7,
      currency: 'TND',
      tz: 'UTC',
    });
  });

  it('accepts a real time zone and rejects an unknown one', () => {
    expect(
      dailySeriesQuerySchema.safeParse({
        from: '2026-11-02',
        currency: 'TND',
        tz: 'Africa/Tunis',
      }).success,
    ).toBe(true);
    expect(
      dailySeriesQuerySchema.safeParse({
        from: '2026-11-02',
        currency: 'TND',
        tz: 'Mars/Olympus',
      }).success,
    ).toBe(false);
  });

  it('rejects a date that is not on the calendar and an oversized range', () => {
    expect(
      dailySeriesQuerySchema.safeParse({ from: '2026-02-30', currency: 'TND' })
        .success,
    ).toBe(false);
    expect(
      dailySeriesQuerySchema.safeParse({
        from: '2026-11-02',
        currency: 'TND',
        days: 400,
      }).success,
    ).toBe(false);
  });
});
