// Unsaved input kept across a session-expired redirect so signing back in doesn't cost what the
// user typed: sessionStorage, one key per form, read once, ignored once stale.

export const FORM_STASH_MAX_AGE_MS = 30 * 60 * 1000;

type Stashed = { savedAt: number; values: unknown };

function sessionStore(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined; // no window (server) or storage blocked
  }
}

export function stashForm(
  key: string,
  values: unknown,
  { now = Date.now(), store = sessionStore() }: { now?: number; store?: Storage } = {},
): void {
  try {
    store?.setItem(key, JSON.stringify({ savedAt: now, values } satisfies Stashed));
  } catch {
    /* full or blocked storage: the input is lost, as it was before */
  }
}

/**
 * Read and clear the stash for `key`. Returns undefined when there is none, it
 * is older than `maxAgeMs` (or from the future), or it can't be parsed.
 */
export function takeStashedForm<T>(
  key: string,
  {
    now = Date.now(),
    maxAgeMs = FORM_STASH_MAX_AGE_MS,
    store = sessionStore(),
  }: { now?: number; maxAgeMs?: number; store?: Storage } = {},
): T | undefined {
  let raw: string | null | undefined;
  try {
    raw = store?.getItem(key);
    store?.removeItem(key);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;

  let parsed: Partial<Stashed>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed.savedAt !== "number" || typeof parsed.values !== "object" || !parsed.values) {
    return undefined;
  }
  const age = now - parsed.savedAt;
  if (age < 0 || age > maxAgeMs) return undefined;
  return parsed.values as T;
}
