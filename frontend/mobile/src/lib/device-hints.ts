import { getCalendars, getLocales } from 'expo-localization';

import { guessCurrency, type DeviceHints } from '@/core/onboarding';

/**
 * What the device says about where it is, as `guessCurrency` reads it. The time zone decides first:
 * language tags give no region without `Intl.Locale` (not on Hermes).
 */
export function getDeviceHints(): DeviceHints {
  let timeZone: string | undefined;
  let languages: string[] | undefined;
  try {
    timeZone = getCalendars()[0]?.timeZone ?? undefined;
  } catch {
    /* no time zone: the locale decides */
  }
  try {
    languages = getLocales().map((l) => l.languageTag);
  } catch {
    /* no locales */
  }
  return { timeZone, languages };
}

/** The currency a new account most likely holds on this device (USD when nothing says otherwise). */
export function guessDeviceCurrency(): string {
  return guessCurrency(getDeviceHints());
}
