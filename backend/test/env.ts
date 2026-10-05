// Environment for the end-to-end tests (loaded before any module).
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://rbac:rbac@localhost:5432/rbac_test?schema=public';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_ACCESS_SECRET = 'test-secret';
process.env.LOGIN_RATE_LIMIT_PER_MINUTE = '10000';
process.env.LOGIN_MAX_ATTEMPTS = '5';
process.env.DEMO_MODE = 'true';
