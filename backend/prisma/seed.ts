import { NestFactory } from '@nestjs/core';
import {
  buildDemoPlan,
  DEMO_DEFAULT_PASSWORD,
  DEMO_EMAIL,
  demoSeedRefusal,
} from '../src/demo/demo-plan';
import { DemoSeedModule } from '../src/demo/demo-seed.module';
import { DemoSeeder } from '../src/demo/demo-seeder';

/**
 * Seeds the demo account (demo@mofin.app) with three months of data: `npx prisma db seed [--
 * --reset]`. Refused in production unless ALLOW_DEMO_SEED=true.
 */
async function main() {
  const refusal = demoSeedRefusal(process.env);
  if (refusal) {
    console.error(refusal);
    process.exitCode = 1;
    return;
  }

  const reset =
    process.argv.includes('--reset') || process.env.DEMO_RESET === 'true';
  const password = process.env.DEMO_PASSWORD || DEMO_DEFAULT_PASSWORD;
  const plan = buildDemoPlan(new Date());

  const app = await NestFactory.createApplicationContext(DemoSeedModule, {
    logger: ['error', 'warn'],
  });
  try {
    const result = await app.get(DemoSeeder).run({ plan, password, reset });
    if (result.status === 'exists') {
      console.log(
        `The demo account ${DEMO_EMAIL} already exists; nothing changed. Run with --reset to recreate it.`,
      );
      return;
    }

    const { summary } = result;
    console.log(`${result.reset ? 'Recreated' : 'Created'} the demo account.`);
    console.log(
      `  Login:        ${DEMO_EMAIL} / ${process.env.DEMO_PASSWORD ? '(DEMO_PASSWORD)' : DEMO_DEFAULT_PASSWORD}`,
    );
    console.log(`  Accounts:     ${result.accounts}`);
    console.log(
      `  Transactions: ${result.transactions} (${plan.windowStart.toISOString().slice(0, 10)} to today)`,
    );
    console.log(`  Goals:        ${result.goals}`);
    for (const [label, counts] of [
      ['By account', summary.byAccount],
      ['By category', summary.byCategory],
      ['By month', summary.byMonth],
    ] as const) {
      console.log(
        `  ${label}: ${Object.entries(counts)
          .map(([key, count]) => `${key} ${count}`)
          .join(', ')}`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
