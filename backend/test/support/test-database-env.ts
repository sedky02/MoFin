import { testDatabaseUrl } from './test-database';

// Before any module loads, so the app connects here and nowhere else.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';
