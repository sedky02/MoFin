import { inviteToken, INVITATION_PATH, safeDeepLinkPath } from '@/lib/deep-links';
import { rememberInvite } from '@/lib/pending-invite';

/** Every incoming link goes through the allow-list in src/lib/deep-links.ts. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  const safe = safeDeepLinkPath(path);
  if (safe === INVITATION_PATH) {
    const token = inviteToken(path);
    if (token) rememberInvite(token);
  }
  return safe;
}
