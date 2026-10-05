function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

/** Runtime configuration, read lazily from the environment. */
export const config = {
  get port() {
    return readInt('PORT', 3000);
  },
  get corsOrigins() {
    return (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((o) => o.trim());
  },
  get jwtAccessSecret() {
    return process.env.JWT_ACCESS_SECRET ?? 'dev-only-secret-change-me';
  },
  get accessTokenTtlSeconds() {
    return readInt('JWT_ACCESS_TTL_SECONDS', 900);
  },
  get refreshTokenTtlDays() {
    return readInt('REFRESH_TOKEN_TTL_DAYS', 7);
  },
  get cookieSecure() {
    return readBool('COOKIE_SECURE', false);
  },
  get loginMaxAttempts() {
    return readInt('LOGIN_MAX_ATTEMPTS', 5);
  },
  get loginLockMinutes() {
    return readInt('LOGIN_LOCK_MINUTES', 15);
  },
  get loginRateLimitPerMinute() {
    return readInt('LOGIN_RATE_LIMIT_PER_MINUTE', 20);
  },
  get demoMode() {
    return readBool('DEMO_MODE', false);
  },
};

export const REFRESH_COOKIE = 'refresh_token';
export const DEMO_PASSWORD = 'Demo1234!';
