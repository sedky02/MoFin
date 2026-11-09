import { initialGoalDraft, validateGoalDraft, type GoalDraft } from './goal-form-state';

const base: GoalDraft = {
  accountId: 'a1',
  name: ' Holiday ',
  type: 'EXPENSE',
  targetAmount: '1,200.5',
  isRecurring: false,
  recurrenceUnit: undefined,
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
};

describe('validateGoalDraft', () => {
  it('builds a fixed-period goal with the parsed target and no recurrence', () => {
    const r = validateGoalDraft(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input).toMatchObject({ name: 'Holiday', type: 'EXPENSE', isRecurring: false, periodEnd: '2026-11-30', recurrenceUnit: undefined });
      expect(r.input.targetAmount).toBe('1200.5');
    }
  });

  it('builds a recurring goal without an end date', () => {
    const r = validateGoalDraft({ ...base, isRecurring: true, recurrenceUnit: 'YEAR', periodEnd: '' });
    expect(r.ok && r.input).toMatchObject({ isRecurring: true, recurrenceUnit: 'YEAR', periodEnd: undefined });
  });

  it('uses the web messages', () => {
    const r = validateGoalDraft({ ...base, name: ' ', accountId: '', targetAmount: 'abc', periodEnd: '' });
    expect(r).toEqual({
      ok: false,
      errors: {
        accountId: 'Select an account.',
        name: 'Name is required.',
        targetAmount: 'Enter a valid amount.',
        periodEnd: 'Pick the last day of the goal.',
      },
    });
  });

  it('needs an interval for a recurring goal and an end after the start for a fixed one', () => {
    expect(validateGoalDraft({ ...base, isRecurring: true })).toMatchObject({
      ok: false,
      errors: { recurrenceUnit: 'Pick how often this goal repeats.' },
    });
    expect(validateGoalDraft({ ...base, periodEnd: '2026-10-31' })).toMatchObject({
      ok: false,
      errors: { periodEnd: "End date can't be before the start date." },
    });
    // A one-day goal is fine.
    expect(validateGoalDraft({ ...base, periodEnd: '2026-11-01' }).ok).toBe(true);
  });
});

describe('initialGoalDraft', () => {
  it('starts a new goal on the active account, as a monthly spending cap from today', () => {
    expect(initialGoalDraft(undefined, 'a9', '2026-11-03')).toMatchObject({
      accountId: 'a9',
      type: 'EXPENSE',
      isRecurring: true,
      recurrenceUnit: 'MONTH',
      periodStart: '2026-11-03',
    });
  });
});
