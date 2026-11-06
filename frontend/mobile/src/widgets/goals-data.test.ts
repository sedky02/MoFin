import type { Goal } from '@/core/types';
import { goalRow, goalsProps, MAX_WIDGET_GOALS, toggleGoal } from '@/widgets/goals-data';
import { parseWidgetSettings } from '@/widgets/widget-settings';

const NOW = new Date('2026-11-15T12:00:00Z');

const goal = (id: string, over: Partial<Goal> = {}, progress = '0', target = '1000'): Goal => ({
  id,
  accountId: 'bank',
  name: `Goal ${id}`,
  type: 'BALANCE',
  targetAmount: target,
  isRecurring: false,
  periodStart: '2026-11-01',
  createdAt: '',
  updatedAt: '',
  currentInstance: {
    id: `i-${id}`,
    goalId: id,
    periodStart: '2026-11-01T00:00:00Z',
    periodEnd: '2026-12-01T00:00:00Z',
    targetAmount: target,
    progressAmount: progress,
    status: 'IN_PROGRESS',
    computedAt: '',
  },
  ...over,
});

describe('goalRow', () => {
  it('shows the percentage reached and a 0-1 bar', () => {
    expect(goalRow(goal('a', {}, '450'), NOW)).toMatchObject({ name: 'Goal a', percent: '45%', progress: 0.45, tone: 'good' });
  });

  it('marks a spending cap that is passed, with the real percentage but a full bar', () => {
    const row = goalRow(goal('a', { type: 'EXPENSE' }, '1170'), NOW);
    expect(row).toMatchObject({ percent: '117%', progress: 1, tone: 'over' });
  });

  it('marks a goal trailing the time gone by, and an achieved one', () => {
    // Half the month gone, 10% saved: behind.
    expect(goalRow(goal('a', {}, '100'), NOW).tone).toBe('behind');
    const done = goal('b', {}, '1000');
    done.currentInstance!.status = 'ACHIEVED';
    expect(goalRow(done, NOW).tone).toBe('done');
  });

  it('reads 0% for a goal with no open period', () => {
    expect(goalRow(goal('a', { currentInstance: null }), NOW)).toMatchObject({ percent: '0%', progress: 0 });
  });
});

describe('goalsProps', () => {
  const goals = [goal('a', {}, '500'), goal('b'), goal('c'), goal('d')];

  it('shows the chosen goals in the order picked, at most three', () => {
    const props = goalsProps({ goals, chosenIds: ['c', 'a', 'd', 'b'], at: NOW });
    expect(props.kind).toBe('data');
    expect(props.rows.map((r) => r.name)).toEqual(['Goal c', 'Goal a', 'Goal d']);
    expect(props.openUrl).toBe('mofin://goals');
  });

  it('asks to choose when none are picked yet, and links to the setup', () => {
    const props = goalsProps({ goals, chosenIds: [], at: NOW });
    expect(props).toMatchObject({ kind: 'message', openUrl: 'mofin://widget-setup?widget=Goals' });
    expect(props.message).toMatch(/choose/);
  });

  it('asks again when every chosen goal ended or was removed, and notes a partial loss', () => {
    expect(goalsProps({ goals, chosenIds: ['gone'], at: NOW }).message).toMatch(/ended or were removed/);
    expect(goalsProps({ goals, chosenIds: ['a', 'gone'], at: NOW }).note).toMatch(/removed/);
  });

  it('invites to set a goal when there are none', () => {
    expect(goalsProps({ goals: [], chosenIds: ['a'], at: NOW }).message).toMatch(/Set a goal/);
  });
});

describe('toggleGoal', () => {
  it('adds in order, removes, and stops at three', () => {
    expect(toggleGoal([], 'a')).toEqual(['a']);
    expect(toggleGoal(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleGoal(['a', 'b', 'c'], 'd')).toEqual(['a', 'b', 'c']);
    expect(MAX_WIDGET_GOALS).toBe(3);
  });
});

describe('parseWidgetSettings', () => {
  it('reads each widget, carrying the first version’s one Summary choice over to both summaries', () => {
    expect(parseWidgetSettings(JSON.stringify({ summary: { period: 'week', accountId: 'bank' }, hideAmounts: true }))).toEqual({
      WeeklySummary: { accountId: 'bank' },
      MonthlySummary: { accountId: 'bank' },
      Goals: { goalIds: [] },
      hideAmounts: true,
    });
    expect(
      parseWidgetSettings(JSON.stringify({ WeeklySummary: { accountId: 'cash' }, Goals: { goalIds: ['a', 2, 'b', 'c', 'd'] } })),
    ).toMatchObject({ WeeklySummary: { accountId: 'cash' }, MonthlySummary: { accountId: 'all' }, Goals: { goalIds: ['a', 'b', 'c'] } });
  });

  it('falls back to defaults for nothing stored or broken JSON', () => {
    expect(parseWidgetSettings(null).WeeklySummary.accountId).toBe('all');
    expect(parseWidgetSettings('{nope').Goals.goalIds).toEqual([]);
  });
});
