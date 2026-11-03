import type { RecurringFormValues } from '@/core/recurring-edit';

import { validateRecurringEdit } from './recurring-series-form';

const initial: RecurringFormValues = { description: 'Rent', amountRaw: '500.00', recurringInterval: 'MONTHLY', recurringEndDate: '2026-01-01' };
const NOW = new Date('2026-06-01T12:00:00');

describe('validateRecurringEdit', () => {
  it('accepts an untouched series, even with an end date already in the past', () => {
    expect(validateRecurringEdit(initial, initial, NOW)).toEqual({});
  });
  it('asks for a description', () => {
    expect(validateRecurringEdit(initial, { ...initial, description: '  ' }, NOW).description).toBe('Add a short description.');
  });
  it('wants a changed end date to be in the future', () => {
    expect(validateRecurringEdit(initial, { ...initial, recurringEndDate: '2026-05-31' }, NOW).recurringEndDate).toBe('End date must be in the future.');
    expect(validateRecurringEdit(initial, { ...initial, recurringEndDate: '2026-12-31' }, NOW)).toEqual({});
    expect(validateRecurringEdit(initial, { ...initial, recurringEndDate: '' }, NOW)).toEqual({});
  });
  it('wants a changed amount to be above zero', () => {
    expect(validateRecurringEdit(initial, { ...initial, amountRaw: '0' }, NOW).amountRaw).toBe('Enter an amount greater than 0.');
    expect(validateRecurringEdit(initial, { ...initial, amountRaw: '' }, NOW).amountRaw).toBe('Enter an amount greater than 0.');
    expect(validateRecurringEdit(initial, { ...initial, amountRaw: '12.5' }, NOW)).toEqual({});
  });
});
