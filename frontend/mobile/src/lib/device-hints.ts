import { getCalendars, getLocales } from 'expo-localization';

import { guessCurrency, type DeviceHints } from '@/core/onboarding';

/**
 * What the device says about where it is, in the shape `guessCurrency` reads. The time zone
 * decides first. Languages are passed as tags; `guessCurrency` can only read a region from them
 * where `Intl.Locale` exists (not on Hermes), so on a phone the time zone does the work.
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
