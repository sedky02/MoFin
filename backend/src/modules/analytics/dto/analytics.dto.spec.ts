import { monthlySummaryQuerySchema } from './analytics.dto';

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
