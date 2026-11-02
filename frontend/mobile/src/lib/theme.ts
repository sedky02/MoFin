import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';

import { COLORS } from '@/theme/colors';

/** The navigator's theme (screen background, headers, tab bar) from the generated palette. */
export const NAV_THEME: Record<'light' | 'dark', Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: COLORS.light.background,
      card: COLORS.light.card,
      text: COLORS.light.foreground,
      border: COLORS.light.border,
      primary: COLORS.light['primary-text'],
      notification: COLORS.light.destructive,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: COLORS.dark.background,
      card: COLORS.dark.card,
      text: COLORS.dark.foreground,
      border: COLORS.dark.border,
      primary: COLORS.dark.primary,
      notification: COLORS.dark.destructive,
    },
  },
};
