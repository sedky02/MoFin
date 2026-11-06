import { inviteToken, INVITATION_PATH, safeDeepLinkPath } from '@/lib/deep-links';
import { rememberInvite } from '@/lib/pending-invite';

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  const safe = safeDeepLinkPath(path);
  if (safe === INVITATION_PATH) {
    const token = inviteToken(path);
    if (token) rememberInvite(token);
  }
  return safe;
}
