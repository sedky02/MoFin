/** A build people can install outside the stores, as `GET /app/releases/latest` returns it. */
export interface AppRelease {
  version: string;
  build: number;
  url: string;
  legacyUrl: string | null;
  notes: string[];
  publishedAt: string;
}

export interface LatestAppReleases {
  android: AppRelease | null;
  ios: AppRelease | null;
}

const RELEASE_DATE = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

/** "Version 1.0.3 · Nov 9, 2026" */
export function releaseLabel(release: Pick<AppRelease, "version" | "publishedAt">): string {
  const date = new Date(release.publishedAt);
  return Number.isNaN(date.getTime())
    ? `Version ${release.version}`
    : `Version ${release.version} · ${RELEASE_DATE.format(date)}`;
}

export const APK_INSTALL_HINT =
  "Android may ask you to allow installs from your browser the first time. Updating installs over the old version and keeps you signed in.";
