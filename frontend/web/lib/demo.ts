/** Why "Try the demo" sent the visitor back to the landing page. */
export type DemoNotice = "busy" | "limited" | "off" | "failed";

export const DEMO_NOTICES: Record<DemoNotice, string> = {
  busy: "The demo is busy right now. Please try again in a few minutes.",
  limited: "You've started a few demos already. Please try again in an hour, or create an account.",
  off: "The demo isn't available right now. You can still create an account.",
  failed: "We couldn't start the demo. Please try again.",
};

export function demoNoticeUrl(notice: DemoNotice): string {
  return `/?demo=${notice}`;
}

export function parseDemoNotice(value: string | string[] | undefined): DemoNotice | null {
  return typeof value === "string" && value in DEMO_NOTICES ? (value as DemoNotice) : null;
}

/** "23 h", "40 min", or null once it has ended. */
export function timeLeft(expiresAt: string, now: number = Date.now()): string | null {
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.ceil(ms / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h` : `${minutes} min`;
}
