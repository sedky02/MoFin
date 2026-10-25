export const MIN_PASSWORD_LENGTH = 8;

/** 0-4. Below the minimum length the score stays 0 ("Too short"), however varied the characters. */
export function scorePassword(pw: string): number {
  if (pw.length < MIN_PASSWORD_LENGTH) return 0;
  let score = 1;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}
