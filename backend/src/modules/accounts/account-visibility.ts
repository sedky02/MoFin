import { z } from 'zod';

export const ACCOUNT_VISIBILITIES = [
  'visible',
  'masked',
  'private',
  'hidden',
] as const;
export type AccountVisibility = (typeof ACCOUNT_VISIBILITIES)[number];
export const accountVisibilitySchema = z.enum(ACCOUNT_VISIBILITIES);

export interface VisibilityEffects {
  /** The balance shows as dots. */
  maskValue: boolean;
  /** The account is part of "All accounts" figures. */
  countInTotals: boolean;
  /** The account can be picked on the dashboard. */
  showOnDashboard: boolean;
}

/** The one place that says what a level does; callers never compare the string themselves. */
const EFFECTS: Record<AccountVisibility, VisibilityEffects> = {
  visible: { maskValue: false, countInTotals: true, showOnDashboard: true },
  masked: { maskValue: true, countInTotals: true, showOnDashboard: true },
  private: { maskValue: true, countInTotals: false, showOnDashboard: true },
  hidden: { maskValue: true, countInTotals: false, showOnDashboard: false },
};

export function accountVisibility(level: unknown): VisibilityEffects {
  return EFFECTS[readVisibility(level)];
}

/** Anything unknown reads as visible, so a bad stored value never hides money by accident. */
export function readVisibility(level: unknown): AccountVisibility {
  return ACCOUNT_VISIBILITIES.find((known) => known === level) ?? 'visible';
}

export function visibilityOfMetadata(metadata: unknown): AccountVisibility {
  return readVisibility(
    (metadata as { visibility?: unknown } | null)?.visibility,
  );
}

/** The account's metadata with the owner's level set; every other key is kept. */
export function withVisibility(
  metadata: unknown,
  level: AccountVisibility,
): Record<string, unknown> {
  const {
    visibility: _old,
    hideAmount: _legacy,
    ...rest
  } = (metadata as Record<string, unknown> | null) ?? {};
  void _old;
  void _legacy;
  return level === 'visible' ? rest : { ...rest, visibility: level };
}
