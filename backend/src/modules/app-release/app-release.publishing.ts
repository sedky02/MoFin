import { AppPlatform, Prisma } from '@prisma/client';
import { z } from 'zod';

const httpsUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'), 'Must be an https URL');

export const publishReleaseSchema = z.object({
  platform: z.nativeEnum(AppPlatform),
  version: z.string().trim().min(1).max(32),
  build: z.coerce.number().int().positive(),
  url: httpsUrl,
  legacyUrl: httpsUrl.optional(),
  notes: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
});
export type PublishReleaseInput = z.input<typeof publishReleaseSchema>;

type ReleaseDb = Pick<Prisma.TransactionClient, 'appRelease'>;

/** A publish or withdraw that can't happen as asked (a build number that isn't newer, nothing to withdraw). */
export class ReleaseConflictError extends Error {}

/**
 * Adds a build as the newest release. A build number never goes backwards, even past a withdrawn
 * one: phones compare numbers, so reusing one would hide the update from people who had it.
 */
export async function publishRelease(
  db: ReleaseDb,
  input: PublishReleaseInput,
) {
  const release = publishReleaseSchema.parse(input);
  const newest = await db.appRelease.findFirst({
    where: { platform: release.platform },
    orderBy: { build: 'desc' },
    select: { build: true },
  });
  if (newest && release.build <= newest.build) {
    throw new ReleaseConflictError(
      `Build ${release.build} isn't newer than the last published build (${newest.build}).`,
    );
  }
  return db.appRelease.create({ data: release });
}

/** Hides a build from downloads and update checks; the previous one becomes the latest again. */
export async function withdrawRelease(
  db: ReleaseDb,
  platform: AppPlatform,
  build: number,
) {
  const { count } = await db.appRelease.updateMany({
    where: { platform, build, withdrawnAt: null },
    data: { withdrawnAt: new Date() },
  });
  if (count === 0)
    throw new ReleaseConflictError(
      `No published ${platform} build ${build} to withdraw.`,
    );
}
