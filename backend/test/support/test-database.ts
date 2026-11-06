/**
 * For specs needing real Postgres: TEST_DATABASE_URL=postgresql://…/mofin_test npm run test:db
 * Anything but a local database named `*_test` is refused.
 */
export function testDatabaseUrl(): string {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL is not set');
  const url = new URL(raw);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (!local || !url.pathname.endsWith('_test')) {
    throw new Error(
      'TEST_DATABASE_URL must be a local database whose name ends in _test',
    );
  }
  return raw;
}
