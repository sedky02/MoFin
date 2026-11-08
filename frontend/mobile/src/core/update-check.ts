/** The newest Android build published outside the store, as `GET /app/releases/latest` returns it. */
export interface PublishedBuild {
  version: string;
  build: number;
  url: string;
}

/**
 * The installed build number (Android versionCode) as a number, or null when it can't be read:
 * development builds and the web preview have none, and they never prompt.
 */
export function installedBuildNumber(nativeBuildVersion: string | null | undefined): number | null {
  if (!nativeBuildVersion) return null;
  const build = Number(nativeBuildVersion);
  return Number.isInteger(build) && build > 0 ? build : null;
}

/** True only when both builds are known and the published one is newer. */
export function isUpdateAvailable(installed: number | null, latest: PublishedBuild | null | undefined): boolean {
  return installed !== null && !!latest && latest.build > installed;
}
