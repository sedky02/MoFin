import { safeDeepLinkPath } from '@/lib/deep-links';

/** Every incoming link goes through the allow-list in src/lib/deep-links.ts. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return safeDeepLinkPath(path);
}
