import { execFileSync } from 'child_process';
import { join } from 'path';
import { testDatabaseUrl } from './test-database';

/** Brings the test database up to the current migrations before any spec runs. */
export default function setup(): void {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'pipe',
  });
}
