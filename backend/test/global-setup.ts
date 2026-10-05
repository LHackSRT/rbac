import { execSync } from 'child_process';
import { TEST_DATABASE_URL } from './env';

/** Applies the migrations to the test database once before the e2e suites. */
export default function globalSetup() {
  execSync('npx prisma migrate deploy', {
    cwd: `${__dirname}/..`,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'ignore',
  });
}
