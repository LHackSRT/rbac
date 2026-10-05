import { createTestContext, EMAIL, TestContext } from './helpers';

function refreshCookie(setCookie: string[] | string | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookie = cookies.find((value) => value.startsWith('refresh_token='));
  if (!cookie) throw new Error('No refresh cookie');
  return cookie.split(';')[0];
}

describe('Authentication (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('logs in and sets the refresh token as an httpOnly cookie', async () => {
    const response = await ctx.http()
      .post('/api/auth/login')
      .send({ email: EMAIL.viewer, password: 'Demo1234!' })
      .expect(200);
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.expiresIn).toBe(900);
    const cookie = (response.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('refresh_token='));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/auth');
  });

  it('refuses bad credentials with the same error for unknown e-mails', async () => {
    const badPassword = await ctx.http().post('/api/auth/login').send({ email: EMAIL.viewer, password: 'nope' }).expect(401);
    const unknown = await ctx.http().post('/api/auth/login').send({ email: 'ghost@aqualab.test', password: 'nope' }).expect(401);
    expect(badPassword.body.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('requires a valid access token', async () => {
    expect((await ctx.http().get('/api/auth/me').expect(401)).body.code).toBe('UNAUTHENTICATED');
    await ctx.http().get('/api/auth/me').set('Authorization', 'Bearer forged.token.value').expect(401);
  });

  it('returns the profile with effective permissions', async () => {
    const token = await ctx.login(EMAIL.technician1);
    const me = (await ctx.http().get('/api/auth/me').set('Authorization', token).expect(200)).body;
    expect(me.email).toBe(EMAIL.technician1);
    expect(me.roles.map((role: { code: string }) => role.code)).toEqual(['TECHNICIAN']);
    expect(me.permissions).toEqual([
      'parameter:read',
      'result:read',
      'sample:create',
      'sample:read',
      'sample:update:own',
      'sampling-point:read',
    ]);
  });

  it('rotates refresh tokens and revokes every session when a used token is replayed', async () => {
    const login = await ctx.http().post('/api/auth/login').send({ email: EMAIL.quality, password: 'Demo1234!' }).expect(200);
    const first = refreshCookie(login.headers['set-cookie']);

    const refreshed = await ctx.http().post('/api/auth/refresh').set('Cookie', first).expect(200);
    const second = refreshCookie(refreshed.headers['set-cookie']);
    expect(second).not.toEqual(first);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));

    // Simulate a replay of the first token well after its rotation.
    const userId = await ctx.userId(EMAIL.quality);
    await ctx.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });
    const replay = await ctx.http().post('/api/auth/refresh').set('Cookie', first).expect(401);
    expect(replay.body.code).toBe('INVALID_REFRESH_TOKEN');

    // The legitimate token has been revoked too.
    await ctx.http().post('/api/auth/refresh').set('Cookie', second).expect(401);
    const audit = await ctx.prisma.auditLog.findFirst({ where: { action: 'AUTH_REFRESH_TOKEN_REUSED', targetId: userId } });
    expect(audit).not.toBeNull();
  });

  it('revokes the refresh token on logout', async () => {
    const login = await ctx.http().post('/api/auth/login').send({ email: EMAIL.viewer, password: 'Demo1234!' }).expect(200);
    const cookie = refreshCookie(login.headers['set-cookie']);
    await ctx.http().post('/api/auth/logout').set('Cookie', cookie).expect(204);
    await ctx.http().post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('locks the account after 5 failed attempts until an administrator unlocks it', async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const response = await ctx.http().post('/api/auth/login').send({ email: EMAIL.analyst2, password: 'wrong' }).expect(401);
      expect(response.body.code).toBe('INVALID_CREDENTIALS');
    }
    const fifth = await ctx.http().post('/api/auth/login').send({ email: EMAIL.analyst2, password: 'wrong' }).expect(401);
    expect(fifth.body.code).toBe('ACCOUNT_LOCKED');
    expect(fifth.body.details.lockedUntil).toEqual(expect.any(String));

    // Even the right password is refused while locked.
    const locked = await ctx.http().post('/api/auth/login').send({ email: EMAIL.analyst2, password: 'Demo1234!' }).expect(401);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');

    const admin = await ctx.login(EMAIL.admin);
    const unlocked = await ctx.http()
      .post(`/api/users/${await ctx.userId(EMAIL.analyst2)}/unlock`)
      .set('Authorization', admin)
      .expect(200);
    expect(unlocked.body.status).toBe('ACTIVE');
    await ctx.login(EMAIL.analyst2);
  });

  it('cuts off a disabled account immediately', async () => {
    const technicianToken = await ctx.login(EMAIL.technician1);
    const login = await ctx.http().post('/api/auth/login').send({ email: EMAIL.technician1, password: 'Demo1234!' }).expect(200);
    const cookie = refreshCookie(login.headers['set-cookie']);
    const admin = await ctx.login(EMAIL.admin);
    const technicianId = await ctx.userId(EMAIL.technician1);

    await ctx.http().patch(`/api/users/${technicianId}/status`).set('Authorization', admin).send({ status: 'DISABLED' }).expect(200);

    expect((await ctx.http().get('/api/auth/me').set('Authorization', technicianToken).expect(401)).body.code).toBe('ACCOUNT_DISABLED');
    await ctx.http().post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    const relogin = await ctx.http().post('/api/auth/login').send({ email: EMAIL.technician1, password: 'Demo1234!' }).expect(401);
    expect(relogin.body.code).toBe('ACCOUNT_DISABLED');

    await ctx.http().patch(`/api/users/${technicianId}/status`).set('Authorization', admin).send({ status: 'ACTIVE' }).expect(200);
    await ctx.login(EMAIL.technician1);
  });

  it('changes the password with the policy enforced', async () => {
    const token = await ctx.login(EMAIL.viewer);
    const weak = await ctx.http()
      .post('/api/auth/change-password')
      .set('Authorization', token)
      .send({ currentPassword: 'Demo1234!', newPassword: 'short' })
      .expect(400);
    expect(weak.body.code).toBe('WEAK_PASSWORD');
    const wrong = await ctx.http()
      .post('/api/auth/change-password')
      .set('Authorization', token)
      .send({ currentPassword: 'bad', newPassword: 'NewPassw0rd' })
      .expect(400);
    expect(wrong.body.code).toBe('INVALID_CURRENT_PASSWORD');
    await ctx.http()
      .post('/api/auth/change-password')
      .set('Authorization', token)
      .send({ currentPassword: 'Demo1234!', newPassword: 'NewPassw0rd' })
      .expect(204);
    await ctx.login(EMAIL.viewer, 'NewPassw0rd');
  });

  it('lists the demo accounts in demo mode', async () => {
    const response = await ctx.http().get('/api/auth/demo-accounts').expect(200);
    expect(response.body.enabled).toBe(true);
    expect(response.body.accounts).toHaveLength(9);
    expect(response.body.accounts[0]).toMatchObject({ email: EMAIL.superAdmin, roles: [{ code: 'SUPER_ADMIN' }] });
  });

  it('validates request bodies', async () => {
    const response = await ctx.http().post('/api/auth/login').send({ email: 'not-an-email', extra: true }).expect(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'email' })]));
  });
});
