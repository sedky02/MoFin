import { AppPlatform } from '@prisma/client';
import { AppReleaseService } from './app-release.service';
import { publishRelease, withdrawRelease } from './app-release.publishing';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  platform: AppPlatform.ANDROID,
  version: '1.0.3',
  build: 12,
  url: 'https://example.com/mofin.apk',
  legacyUrl: null,
  notes: ['Faster sync'],
  publishedAt: new Date('2026-11-09T00:00:00Z'),
  withdrawnAt: null,
  createdAt: new Date('2026-11-09T00:00:00Z'),
  ...over,
});

describe('AppReleaseService.latest', () => {
  it('returns the newest build that has not been withdrawn, per platform', async () => {
    const findFirst = jest.fn(
      async ({ where }: { where: { platform: AppPlatform } }) =>
        where.platform === AppPlatform.ANDROID ? row() : null,
    );
    const service = new AppReleaseService({
      appRelease: { findFirst },
    } as never);

    const latest = await service.latest();

    expect(latest.android).toEqual({
      version: '1.0.3',
      build: 12,
      url: 'https://example.com/mofin.apk',
      legacyUrl: null,
      notes: ['Faster sync'],
      publishedAt: new Date('2026-11-09T00:00:00Z'),
    });
    expect(latest.ios).toBeNull();
    expect(findFirst).toHaveBeenCalledWith({
      where: { platform: AppPlatform.ANDROID, withdrawnAt: null },
      orderBy: { build: 'desc' },
    });
  });

  it('returns null for both when nothing is published', async () => {
    const service = new AppReleaseService({
      appRelease: { findFirst: jest.fn(async () => null) },
    } as never);
    expect(await service.latest()).toEqual({ android: null, ios: null });
  });
});

describe('publishRelease', () => {
  const input = {
    platform: AppPlatform.ANDROID,
    version: '1.0.4',
    build: 13,
    url: 'https://example.com/mofin-13.apk',
    notes: ['Update banner'],
  };
  const db = (newestBuild: number | null) => {
    const create = jest.fn(async ({ data }: { data: object }) => ({
      ...row(),
      ...data,
    }));
    return {
      create,
      db: {
        appRelease: {
          findFirst: jest.fn(async () =>
            newestBuild === null ? null : { build: newestBuild },
          ),
          create,
        },
      } as never,
    };
  };

  it('adds a newer build', async () => {
    const { db: client, create } = db(12);
    await publishRelease(client, input);
    expect(create).toHaveBeenCalledWith({ data: { ...input } });
  });

  it("refuses a build number that isn't newer, withdrawn builds included", async () => {
    const { db: client, create } = db(13);
    await expect(publishRelease(client, input)).rejects.toThrow(/isn't newer/);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a link that is not https', async () => {
    const { db: client } = db(null);
    await expect(
      publishRelease(client, { ...input, url: 'http://example.com/a.apk' }),
    ).rejects.toThrow(/https/);
  });
});

describe('withdrawRelease', () => {
  it('hides a published build', async () => {
    const updateMany = jest.fn(async () => ({ count: 1 }));
    await withdrawRelease(
      { appRelease: { updateMany } } as never,
      AppPlatform.ANDROID,
      12,
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { platform: AppPlatform.ANDROID, build: 12, withdrawnAt: null },
      data: { withdrawnAt: expect.any(Date) },
    });
  });

  it('says so when there is nothing to withdraw', async () => {
    const updateMany = jest.fn(async () => ({ count: 0 }));
    await expect(
      withdrawRelease(
        { appRelease: { updateMany } } as never,
        AppPlatform.ANDROID,
        99,
      ),
    ).rejects.toThrow(/No published/);
  });
});
