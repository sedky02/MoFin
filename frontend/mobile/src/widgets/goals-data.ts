// The Goals widget's content, worked out in the app: one focus goal with a ring and up to two more
// as pills. Percentages only, no amounts: nothing to mask.
import { goalPercent, goalProgressRatio } from '@/core/format';
import { goalTone } from '@/core/goal-standing';
import type { Goal } from '@/core/types';
import { updatedLabel, WIDGET_LINKS } from '@/widgets/summary-data';

export const MAX_WIDGET_GOALS = 3;

export function toggleGoal(picked: string[], id: string): string[] {
  if (picked.includes(id)) return picked.filter((g) => g !== id);
  return picked.length >= MAX_WIDGET_GOALS ? picked : [...picked, id];
}

export type GoalRowTone = 'good' | 'behind' | 'over' | 'done';

export type GoalRow = {
  name: string;
  percent: string;
  progress: number;
  tone: GoalRowTone;
  /** A plain word for the tone: "On track", "Behind", "Over budget", "Missed" or "Done". */
  status: string;
};

/** The first goal picked: shown large, with a ring. */
export type GoalFocus = GoalRow;

export type GoalPill = { name: string; percent: string };

export type GoalsWidgetProps = {
  kind: 'data' | 'message';
  /** "3 goals · 1 off track". */
  summary: string;
  focus: GoalFocus | null;
  others: GoalPill[];
  updated: string;
  note: string;
  message: string;
  openUrl: string;
  refreshUrl: string;
};

function emptyGoals(message: string, openUrl: string = WIDGET_LINKS.goals): GoalsWidgetProps {
  return {
    kind: 'message',
    summary: '',
    focus: null,
    others: [],
    updated: '',
    note: '',
    message,
    openUrl,
    refreshUrl: WIDGET_LINKS.refreshGoals,
  };
}

export const signedOutGoals = () => emptyGoals('Open MoFin to sign in.');

export function rowTone(goal: Goal, now: Date): GoalRowTone {
  const tone = goalTone(goal, now);
  if (tone === 'failed') return 'over';
  if (tone === 'behind') return 'behind';
  if (tone === 'achieved') return 'done';
  return 'good';
}

function statusOf(tone: GoalRowTone, goal: Goal): string {
  if (tone === 'over') return goal.type === 'EXPENSE' ? 'Over budget' : 'Missed';
  return { good: 'On track', behind: 'Behind', done: 'Done' }[tone];
}

export function goalRow(goal: Goal, now: Date): GoalRow {
  const instance = goal.currentInstance;
  const progress = instance?.progressAmount ?? '0';
  const target = instance?.targetAmount ?? goal.targetAmount;
  const tone = rowTone(goal, now);
  return {
    name: goal.name,
    percent: `${goalPercent(progress, target)}%`,
    progress: goalProgressRatio(progress, target) / 100,
    tone,
    status: statusOf(tone, goal),
  };
}

/**
 * Glance can't share a row's width between pills, so the names are cut here to what fits: two pills
 * share the row, one has it to itself.
 */
export function pillName(name: string, pillCount: number): string {
  const max = pillCount > 1 ? 9 : 22;
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

function summaryOf(rows: GoalRow[]): string {
  const offTrack = rows.filter((r) => r.tone === 'behind' || r.tone === 'over').length;
  const count = `${rows.length} goal${rows.length === 1 ? '' : 's'}`;
  return offTrack ? `${count} · ${offTrack} off track` : count;
}

/**
 * The chosen goals that still exist (active), in the order they were picked, at most three; the first is the focus goal. Goals
 * that were deleted or ended drop out; when none are left the widget asks to choose again.
 */
export function goalsProps(input: {
  goals: Goal[];
  chosenIds: string[];
  at: Date;
  locale?: string;
}): GoalsWidgetProps {
  const { goals, chosenIds, at } = input;
  if (!goals.length) return emptyGoals('Set a goal in MoFin to follow it here.');
  const chosen = chosenIds
    .map((id) => goals.find((g) => g.id === id))
    .filter((g): g is Goal => !!g)
    .slice(0, MAX_WIDGET_GOALS);
  if (!chosen.length) {
    return emptyGoals(
      chosenIds.length ? 'Your goals ended or were removed. Tap to choose again.' : 'Tap to choose the goals to follow.',
      WIDGET_LINKS.setup('Goals'),
    );
  }
  const rows = chosen.map((g) => goalRow(g, at));
  return {
    kind: 'data',
    summary: summaryOf(rows),
    focus: rows[0],
    others: rows.slice(1).map(({ name, percent }, _i, rest) => ({ name: pillName(name, rest.length), percent })),
    updated: updatedLabel(at, input.locale),
    note: chosen.length < Math.min(chosenIds.length, MAX_WIDGET_GOALS) ? 'A goal ended or was removed' : '',
    message: '',
    openUrl: WIDGET_LINKS.goals,
    refreshUrl: WIDGET_LINKS.refreshGoals,
  };
}
