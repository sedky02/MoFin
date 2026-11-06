/**
 * For specs that need real Postgres: what the in-memory fake can't show, such
 * as raw SQL, relation filters and foreign keys. Run them with
 *
 *   TEST_DATABASE_URL="postgresql://…@localhost:5432/mofin_test" npm run test:db
 *
 * These specs write to the database, so anything but a local one named
 * `*_test` is refused, whatever the environment says.
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
