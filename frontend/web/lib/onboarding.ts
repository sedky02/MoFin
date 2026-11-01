// What a new user sees first: a currency worth defaulting to, a name worth suggesting, and
// which of the getting-started steps they have already done. Pure, so it is tested without a browser.
import type { AccountType } from "@/lib/types";

// Where the device is says more about the money than the language it is set to (a browser in
// en-US in Tunis holds dinars), so the time zone is asked first. Only zones that name one
// currency are listed; the rest fall through to the locale.
const TIME_ZONE_CURRENCY: Record<string, string> = {
  "Africa/Tunis": "TND", "Africa/Algiers": "DZD", "Africa/Casablanca": "MAD", "Africa/Cairo": "EGP",
  "Africa/Lagos": "NGN", "Africa/Accra": "GHS", "Africa/Nairobi": "KES", "Africa/Johannesburg": "ZAR",
  "Asia/Dubai": "AED", "Asia/Riyadh": "SAR", "Asia/Qatar": "QAR", "Asia/Kuwait": "KWD", "Asia/Bahrain": "BHD",
  "Asia/Muscat": "OMR", "Asia/Amman": "JOD", "Asia/Beirut": "LBP", "Asia/Baghdad": "IQD", "Asia/Jerusalem": "ILS",
  "Europe/Istanbul": "TRY", "Europe/London": "GBP", "Europe/Dublin": "EUR", "Europe/Paris": "EUR",
  "Europe/Berlin": "EUR", "Europe/Madrid": "EUR", "Europe/Rome": "EUR", "Europe/Amsterdam": "EUR",
  "Europe/Brussels": "EUR", "Europe/Vienna": "EUR", "Europe/Lisbon": "EUR", "Europe/Helsinki": "EUR",
  "Europe/Athens": "EUR", "Europe/Luxembourg": "EUR", "Europe/Zagreb": "EUR", "Europe/Sofia": "EUR",
  "Europe/Zurich": "CHF", "Europe/Stockholm": "SEK", "Europe/Oslo": "NOK", "Europe/Copenhagen": "DKK",
  "Europe/Warsaw": "PLN", "Europe/Prague": "CZK", "Europe/Budapest": "HUF", "Europe/Bucharest": "RON",
  "Europe/Kyiv": "UAH", "Europe/Moscow": "RUB",
  "Asia/Karachi": "PKR", "Asia/Dhaka": "BDT", "Asia/Colombo": "LKR", "Asia/Kolkata": "INR", "Asia/Calcutta": "INR",
  "Asia/Bangkok": "THB", "Asia/Ho_Chi_Minh": "VND", "Asia/Jakarta": "IDR", "Asia/Manila": "PHP",
  "Asia/Kuala_Lumpur": "MYR", "Asia/Singapore": "SGD", "Asia/Hong_Kong": "HKD", "Asia/Taipei": "TWD",
  "Asia/Shanghai": "CNY", "Asia/Seoul": "KRW", "Asia/Tokyo": "JPY",
  "Australia/Sydney": "AUD", "Australia/Melbourne": "AUD", "Australia/Brisbane": "AUD", "Australia/Perth": "AUD",
  "Pacific/Auckland": "NZD",
  "America/New_York": "USD", "America/Chicago": "USD", "America/Denver": "USD", "America/Los_Angeles": "USD",
  "America/Phoenix": "USD", "America/Anchorage": "USD", "Pacific/Honolulu": "USD",
  "America/Toronto": "CAD", "America/Vancouver": "CAD", "America/Edmonton": "CAD", "America/Winnipeg": "CAD",
  "America/Halifax": "CAD", "America/Mexico_City": "MXN", "America/Sao_Paulo": "BRL",
  "America/Argentina/Buenos_Aires": "ARS", "America/Santiago": "CLP", "America/Bogota": "COP", "America/Lima": "PEN",
};

const EURO_REGIONS = ["AT", "BE", "BG", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"];
const REGION_CURRENCY: Record<string, string> = {
  US: "USD", CA: "CAD", GB: "GBP", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF",
  RO: "RON", TR: "TRY", UA: "UAH", RU: "RUB", AU: "AUD", NZ: "NZD", JP: "JPY", CN: "CNY", IN: "INR", KR: "KRW",
  SG: "SGD", HK: "HKD", TW: "TWD", TH: "THB", MY: "MYR", ID: "IDR", PH: "PHP", VN: "VND", PK: "PKR", BD: "BDT",
  LK: "LKR", AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR", JO: "JOD", LB: "LBP", IQ: "IQD",
  IL: "ILS", EG: "EGP", MA: "MAD", DZ: "DZD", TN: "TND", NG: "NGN", GH: "GHS", KE: "KES", ZA: "ZAR", BR: "BRL",
  MX: "MXN", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
  ...Object.fromEntries(EURO_REGIONS.map((region) => [region, "EUR"])),
};

export const FALLBACK_CURRENCY = "USD";

export interface DeviceHints {
  timeZone?: string;
  /** Preferred languages, most preferred first (`navigator.languages`). */
  languages?: readonly string[];
}

function deviceHints(): DeviceHints {
  if (typeof navigator === "undefined") return {};
  let timeZone: string | undefined;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    /* no Intl time zone: the locale decides */
  }
  return { timeZone, languages: navigator.languages?.length ? navigator.languages : [navigator.language] };
}

function regionOf(tag: string): string | undefined {
  try {
    return new Intl.Locale(tag).region;
  } catch {
    return undefined;
  }
}

/**
 * The currency a new account most likely holds: the one of the time zone the device is in,
 * else of the first language that names a region ("fr-TN"), else USD. Only a first guess:
 * the form shows it and says where it came from, because an account's currency is fixed.
 */
export function guessCurrency(hints: DeviceHints = deviceHints()): string {
  const byZone = hints.timeZone ? TIME_ZONE_CURRENCY[hints.timeZone] : undefined;
  if (byZone) return byZone;
  for (const tag of hints.languages ?? []) {
    const region = regionOf(tag);
    const byRegion = region ? REGION_CURRENCY[region] : undefined;
    if (byRegion) return byRegion;
  }
  return FALLBACK_CURRENCY;
}

const ACCOUNT_NAME: Record<AccountType, string> = {
  BANK: "Main bank account",
  CASH: "Cash wallet",
  SAVINGS: "Savings",
  CRYPTO: "Crypto wallet",
};

/** A name worth keeping, so the first account takes one tap instead of a blank field. */
export function suggestAccountName(type: AccountType): string {
  return ACCOUNT_NAME[type];
}

/** The setup flow, in order: the first account, then the first transaction. */
export const SETUP_STEPS = ["account", "transaction"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

/**
 * Where the setup flow is for this user, or null once it is over. The first account is
 * required, so without one the flow is always there; the first transaction can be skipped
 * (and stays skipped). Everything else follows from the data, so a step done any other way,
 * or on another device, is simply done.
 */
export function currentSetupStep(opts: {
  accounts: number;
  transactions: number;
  skippedTransaction: boolean;
}): SetupStep | null {
  if (opts.accounts === 0) return "account";
  if (opts.transactions === 0 && !opts.skippedTransaction) return "transaction";
  return null;
}

/** How long after signing up the assistant nudge is offered. */
export const NUDGE_WINDOW_DAYS = 14;

/**
 * Whether to suggest connecting an AI assistant: only once the setup flow is over, only to
 * someone who signed up recently (an established user has chosen not to), never after it
 * was closed, and never for a demo, which can't connect one.
 */
export function shouldNudgeAssistant(opts: {
  setupStep: SetupStep | null;
  connectedApps: number;
  dismissed: boolean;
  isDemo?: boolean;
  createdAt?: string;
  now?: Date;
}): boolean {
  if (opts.setupStep || opts.dismissed || opts.isDemo || opts.connectedApps > 0) return false;
  const created = opts.createdAt ? new Date(opts.createdAt).getTime() : Number.NaN;
  const ageDays = ((opts.now ?? new Date()).getTime() - created) / 86_400_000;
  // Unknown age counts as new: a nudge shown too long costs less than one never shown.
  return Number.isNaN(ageDays) || ageDays <= NUDGE_WINDOW_DAYS;
}
