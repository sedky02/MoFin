/**
 * Publishes or withdraws a mobile build, against whichever database DATABASE_URL points at:
 *   npm run app-release:publish -- --platform android --version 1.0.3 --build 12 \
 *     --url https://… [--legacy-url https://…] [--note "Faster sync"] [--note "…"]
 *   npm run app-release:withdraw -- --platform android --build 12
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppPlatform, PrismaClient } from '@prisma/client';
import {
  publishRelease,
  withdrawRelease,
} from '../src/modules/app-release/app-release.publishing';

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    options: {
      platform: { type: 'string' },
      version: { type: 'string' },
      build: { type: 'string' },
      url: { type: 'string' },
      'legacy-url': { type: 'string' },
      note: { type: 'string', multiple: true },
    },
  });
  const platform = values.platform?.toUpperCase() as AppPlatform;
  if (!Object.values(AppPlatform).includes(platform))
    throw new Error('--platform must be android or ios');

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL');
  const db = new PrismaClient({ adapter: new PrismaPg(url) });
  try {
    if (command === 'publish') {
      const release = await publishRelease(db, {
        platform,
        version: values.version ?? '',
        build: Number(values.build),
        url: values.url ?? '',
        legacyUrl: values['legacy-url'],
        notes: values.note ?? [],
      });
      console.log(
        `Published ${platform} ${release.version} (build ${release.build}).`,
      );
    } else if (command === 'withdraw') {
      await withdrawRelease(db, platform, Number(values.build));
      console.log(`Withdrew ${platform} build ${values.build}.`);
    } else {
      throw new Error('Use "publish" or "withdraw"');
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
