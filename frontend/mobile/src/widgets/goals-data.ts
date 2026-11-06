// The Goals widget's rows, worked out in the app. Percentages only, no amounts: nothing to mask.
import { goalPercent, goalProgressRatio } from '@/core/format';
import { goalTone } from '@/core/goal-standing';
import type { Goal } from '@/core/types';
import { updatedLabel, WIDGET_LINKS } from '@/widgets/summary-data';

export const MAX_WIDGET_GOALS = 3;

/** Adds or removes a goal from the picked ones, keeping the order they were picked in and at most three. */
export function toggleGoal(picked: string[], id: string): string[] {
  if (picked.includes(id)) return picked.filter((g) => g !== id);
  return picked.length >= MAX_WIDGET_GOALS ? picked : [...picked, id];
}

/** How a goal's bar is coloured, from the app's own goal tones. */
export type GoalRowTone = 'good' | 'behind' | 'over' | 'done';

export type GoalRow = {
  name: string;
  /** "45%" (an expense cap can pass 100%). */
  percent: string;
  /** 0 to 1, for the bar. */
  progress: number;
  tone: GoalRowTone;
};

export type GoalsWidgetProps = {
  kind: 'data' | 'message';
  rows: GoalRow[];
  updated: string;
  note: string;
  message: string;
  openUrl: string;
  refreshUrl: string;
};

function emptyGoals(message: string, openUrl: string = WIDGET_LINKS.goals): GoalsWidgetProps {
  return { kind: 'message', rows: [], updated: '', note: '', message, openUrl, refreshUrl: WIDGET_LINKS.refreshGoals };
}

export const signedOutGoals = () => emptyGoals('Open MoFin to sign in.');

export function rowTone(goal: Goal, now: Date): GoalRowTone {
  const tone = goalTone(goal, now);
  if (tone === 'failed') return 'over';
  if (tone === 'behind') return 'behind';
  if (tone === 'achieved') return 'done';
  return 'good';
}

export function goalRow(goal: Goal, now: Date): GoalRow {
  const instance = goal.currentInstance;
  const progress = instance?.progressAmount ?? '0';
  const target = instance?.targetAmount ?? goal.targetAmount;
  return {
    name: goal.name,
    percent: `${goalPercent(progress, target)}%`,
    progress: goalProgressRatio(progress, target) / 100,
    tone: rowTone(goal, now),
  };
}

/**
 * The chosen goals that still exist (active), in the order they were picked, at most three. Goals
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
  return {
    kind: 'data',
    rows: chosen.map((g) => goalRow(g, at)),
    updated: updatedLabel(at, input.locale),
    note: chosen.length < Math.min(chosenIds.length, MAX_WIDGET_GOALS) ? 'A goal ended or was removed' : '',
    message: '',
    openUrl: WIDGET_LINKS.goals,
    refreshUrl: WIDGET_LINKS.refreshGoals,
  };
}
