import type { Account, Goal } from '@/core/types';

import { goalRowModel } from './goal-model';

const account = { id: 'a1', name: 'Main', currency: 'USD' } as Account;
const NOW = new Date('2026-11-10T12:00:00Z');

function goal(over: Partial<Goal> = {}, instance: Partial<NonNullable<Goal['currentInstance']>> = {}): Goal {
  return {
    id: 'g1',
    accountId: 'a1',
    name: 'Emergency fund',
    type: 'BALANCE',
    targetAmount: '1000.00',
    isRecurring: true,
    recurrenceUnit: 'MONTH',
    periodStart: '2026-11-01T00:00:00.000Z',
    periodEnd: '2026-11-30T23:59:59.999Z',
    archivedAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    currentInstance: {
      id: 'i1',
      goalId: 'g1',
      periodStart: '2026-11-01T00:00:00.000Z',
      periodEnd: '2026-11-30T23:59:59.999Z',
      targetAmount: '1000.00',
      progressAmount: '250.00',
      status: 'IN_PROGRESS',
      computedAt: '2026-11-10T00:00:00.000Z',
      ...instance,
    },
    ...over,
  };
}

describe('goalRowModel', () => {
  it('shows ratio, percent, type, account, repeat and time left', () => {
    const m = goalRowModel(goal(), account, NOW);
    expect(m.ratio).toBe(25);
    expect(m.percent).toBe(25);
    expect(m.tone).toBe('on-track');
    expect(m.details).toBe('Balance · Main · Monthly · Resets in 21 days');
    expect(m.currency).toBe('USD');
  });

  it('is behind when progress trails the share of the period already gone', () => {
    expect(goalRowModel(goal({}, { progressAmount: '50.00' }), account, NOW).tone).toBe('behind');
    expect(goalRowModel(goal({}, { progressAmount: '600.00' }), account, NOW).tone).toBe('on-track');
  });

  it('caps the ring percent at 100 for a goal past its target and marks achieved', () => {
    const m = goalRowModel(goal({}, { progressAmount: '1500.00', status: 'ACHIEVED' }), account, NOW);
    expect(m.percent).toBe(100);
    expect(m.tone).toBe('achieved');
  });

  it('marks an expense goal over its cap as failed and over target', () => {
    const m = goalRowModel(goal({ type: 'EXPENSE' }, { progressAmount: '1170.00' }), account, NOW);
    expect(m.overTarget).toBe(true);
    expect(m.tone).toBe('failed');
    expect(m.percent).toBe(100);
  });

  it('describes a cancelled goal by its frozen state', () => {
    const m = goalRowModel(goal({ archivedAt: '2026-11-05T10:00:00.000Z' }), account, NOW);
    expect(m.tone).toBe('cancelled');
    expect(m.details).toContain('Cancelled');
  });

  it('copes with a goal with no open period', () => {
    const m = goalRowModel(goal({ currentInstance: null }), undefined, NOW);
    expect(m.ratio).toBe(0);
    expect(m.progressAmount).toBe('0');
    expect(m.currency).toBe('USD');
  });
});

describe('goalRowModel, card fields', () => {
  it('says what a cap has left and over, with its target and the reason it needs attention', () => {
    const left = goalRowModel(goal({ type: 'EXPENSE' }, { progressAmount: '310.00', targetAmount: '1000.00' }), account, NOW);
    expect(left.headline).toEqual({ amount: '690', label: 'left' });
    const over = goalRowModel(goal({ type: 'EXPENSE' }, { progressAmount: '1170.00' }), account, NOW);
    expect(over.headline?.label).toBe('over');
    expect(over.reason).toBe('Over limit');
  });

  it('names the category, or every category, and none for a balance goal', () => {
    const scoped = goalRowModel(
      goal({ type: 'EXPENSE', category: { id: 'c1', name: 'Dining out', color: '#e05d2a', archivedAt: null } }),
      account,
      NOW,
    );
    expect(scoped.category).toEqual({ name: 'Dining out', color: '#e05d2a' });
    expect(goalRowModel(goal({ type: 'INCOME' }), account, NOW).category?.name).toBe('All income');
    expect(goalRowModel(goal(), account, NOW).category).toBeNull();
  });

  it('folds an achieved goal', () => {
    expect(goalRowModel(goal({}, { progressAmount: '1500.00', status: 'ACHIEVED' }), account, NOW).folded).toBe(true);
  });
});
