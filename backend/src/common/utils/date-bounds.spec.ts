import { exclusiveUpperBound, inclusiveUpperBound, isDateOnly, lowerBound, upperBoundFilter } from './date-bounds';

describe('date bounds', () => {
  it('tells a bare date from a datetime', () => {
    expect(isDateOnly('2026-10-24')).toBe(true);
    expect(isDateOnly(' 2026-10-24 ')).toBe(true);
    expect(isDateOnly('2026-10-24T00:00:00.000Z')).toBe(false);
    expect(isDateOnly('2026-10-24T12:00')).toBe(false);
  });

  it('starts a date-only day at 00:00 UTC and keeps a datetime as-is', () => {
    expect(lowerBound('2026-10-24').toISOString()).toBe('2026-10-24T00:00:00.000Z');
    expect(lowerBound('2026-10-24T08:30:00.000Z').toISOString()).toBe('2026-10-24T08:30:00.000Z');
  });

  describe('a date-only upper bound', () => {
    it('ends at the start of the next day', () => {
      expect(exclusiveUpperBound('2026-10-24').toISOString()).toBe('2026-10-25T00:00:00.000Z');
      expect(inclusiveUpperBound('2026-10-24').toISOString()).toBe('2026-10-24T23:59:59.999Z');
    });

    it('rolls over month ends, leap days and the year end', () => {
      expect(exclusiveUpperBound('2026-10-31').toISOString()).toBe('2026-11-01T00:00:00.000Z');
      expect(exclusiveUpperBound('2026-04-30').toISOString()).toBe('2026-05-01T00:00:00.000Z');
      expect(exclusiveUpperBound('2026-02-28').toISOString()).toBe('2026-03-01T00:00:00.000Z');
      expect(exclusiveUpperBound('2028-02-28').toISOString()).toBe('2028-02-29T00:00:00.000Z');
      expect(exclusiveUpperBound('2028-02-29').toISOString()).toBe('2028-03-01T00:00:00.000Z');
      expect(exclusiveUpperBound('2026-12-31').toISOString()).toBe('2027-01-01T00:00:00.000Z');
      expect(inclusiveUpperBound('2026-12-31').toISOString()).toBe('2026-12-31T23:59:59.999Z');
    });

    it('filters with lt the next day', () => {
      expect(upperBoundFilter('2026-10-24')).toEqual({ lt: new Date('2026-10-25T00:00:00.000Z') });
    });
  });

  describe('a datetime upper bound', () => {
    it('stays an inclusive instant', () => {
      expect(upperBoundFilter('2026-10-24T15:00:00.000Z')).toEqual({ lte: new Date('2026-10-24T15:00:00.000Z') });
      expect(inclusiveUpperBound('2026-10-24T15:00:00.000Z').toISOString()).toBe('2026-10-24T15:00:00.000Z');
      expect(exclusiveUpperBound('2026-10-24T15:00:00.000Z').toISOString()).toBe('2026-10-24T15:00:00.001Z');
    });

    it('keeps an explicit midnight instant as midnight', () => {
      expect(upperBoundFilter('2026-10-24T00:00:00.000Z')).toEqual({ lte: new Date('2026-10-24T00:00:00.000Z') });
    });
  });
});
