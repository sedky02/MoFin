import { Injectable } from '@nestjs/common';
import { AppPlatform, AppRelease } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface LatestRelease {
  version: string;
  build: number;
  url: string;
  legacyUrl: string | null;
  notes: string[];
  publishedAt: Date;
}

function present(release: AppRelease | null): LatestRelease | null {
  if (!release) return null;
  return {
    version: release.version,
    build: release.build,
    url: release.url,
    legacyUrl: release.legacyUrl,
    notes: release.notes,
    publishedAt: release.publishedAt,
  };
}

@Injectable()
export class AppReleaseService {
  constructor(private readonly prisma: PrismaService) {}

  /** The newest build of each platform that hasn't been withdrawn, or null when there's none. */
  async latest(): Promise<Record<'android' | 'ios', LatestRelease | null>> {
    const [android, ios] = await Promise.all(
      [AppPlatform.ANDROID, AppPlatform.IOS].map((platform) =>
        this.prisma.appRelease.findFirst({
          where: { platform, withdrawnAt: null },
          orderBy: { build: 'desc' },
        }),
      ),
    );
    return { android: present(android), ios: present(ios) };
  }
}
