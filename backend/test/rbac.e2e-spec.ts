import { createTestContext, EMAIL, TestContext } from './helpers';

describe('RBAC enforcement (e2e)', () => {
  let ctx: TestContext;
  let samplingPointId: string;
  let parameterId: string;

  const newSample = () => ({ samplingPointId, sampledAt: new Date().toISOString(), parameterIds: [parameterId] });

  beforeAll(async () => {
    ctx = await createTestContext();
    samplingPointId = (await ctx.prisma.samplingPoint.findUniqueOrThrow({ where: { code: 'FOR-01' } })).id;
    parameterId = (await ctx.prisma.parameter.findUniqueOrThrow({ where: { code: 'PH' } })).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('permissions and role hierarchy', () => {
    it('refuses a missing permission with 403 and records it in the audit log', async () => {
      const viewer = await ctx.login(EMAIL.viewer);
      const response = await ctx.http().post('/api/samples').set('Authorization', viewer).send(newSample()).expect(403);
      expect(response.body).toMatchObject({ code: 'FORBIDDEN', details: { missing: ['sample:create'] } });

      const audit = await ctx.prisma.auditLog.findFirst({
        where: { action: 'ACCESS_DENIED', actorEmail: EMAIL.viewer },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit?.details).toMatchObject({ method: 'POST', path: '/api/samples', code: 'FORBIDDEN' });
    });

    it('grants inherited permissions (ANALYST inherits sample:create from TECHNICIAN)', async () => {
      const analyst = await ctx.login(EMAIL.analyst2);
      await ctx.http().post('/api/samples').set('Authorization', analyst).send(newSample()).expect(201);
    });

    it('keeps sibling branches of the hierarchy separate', async () => {
      const quality = await ctx.login(EMAIL.quality);
      const technician = await ctx.login(EMAIL.technician1);
      await ctx.http().post('/api/samples').set('Authorization', quality).send(newSample()).expect(403);
      await ctx.http()
        .patch(`/api/parameters/${parameterId}`)
        .set('Authorization', technician)
        .send({ maxValue: 9 })
        .expect(403);
      await ctx.http().patch(`/api/parameters/${parameterId}`).set('Authorization', quality).send({ maxValue: 8.5 }).expect(200);
    });

    it('gives the administrator no laboratory permission', async () => {
      const admin = await ctx.login(EMAIL.admin);
      await ctx.http().get('/api/samples').set('Authorization', admin).expect(403);
      await ctx.http().get('/api/users').set('Authorization', admin).expect(200);
    });

    it('gives the super administrator every permission', async () => {
      const superAdmin = await ctx.login(EMAIL.superAdmin);
      const me = (await ctx.http().get('/api/auth/me').set('Authorization', superAdmin).expect(200)).body;
      const catalog = await ctx.prisma.permission.count();
      expect(me.permissions).toHaveLength(catalog);
    });
  });

  describe('individual privileges', () => {
    it('applies a temporary ALLOW privilege until it expires', async () => {
      const julienId = await ctx.userId(EMAIL.analyst1);
      const julien = await ctx.login(EMAIL.analyst1);
      let me = (await ctx.http().get('/api/auth/me').set('Authorization', julien)).body;
      expect(me.permissions).toContain('result:validate');

      await ctx.prisma.userPrivilege.updateMany({
        where: { userId: julienId, permission: { code: 'result:validate' } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      me = (await ctx.http().get('/api/auth/me').set('Authorization', julien)).body;
      expect(me.permissions).not.toContain('result:validate');
      expect(me.privileges[0]).toMatchObject({ permission: 'result:validate', active: false });

      await ctx.prisma.userPrivilege.updateMany({
        where: { userId: julienId, permission: { code: 'result:validate' } },
        data: { expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
      });
    });

    it('applies a DENY privilege while keeping the other rights', async () => {
      const marc = await ctx.login(EMAIL.technician2);
      await ctx.http().post('/api/samples').set('Authorization', marc).send(newSample()).expect(403);
      await ctx.http().get('/api/samples').set('Authorization', marc).expect(200);
    });

    it('lets a DENY privilege override a permission inherited from a role', async () => {
      const superAdmin = await ctx.login(EMAIL.superAdmin);
      const karimId = await ctx.userId(EMAIL.labManager);
      const profile = await ctx.http()
        .post(`/api/users/${karimId}/privileges`)
        .set('Authorization', superAdmin)
        .send({ permission: 'sample:create', effect: 'DENY', reason: 'Test' })
        .expect(201);
      expect(profile.body.permissions).not.toContain('sample:create');
      expect(profile.body.permissions).toContain('sample:read');

      const check = await ctx.http()
        .post('/api/authz/check')
        .set('Authorization', superAdmin)
        .send({ userId: karimId, permission: 'sample:create' })
        .expect(200);
      expect(check.body).toMatchObject({ allowed: false, outcome: 'DENIED_BY_PRIVILEGE' });
      expect(check.body.decision.grants[0]).toMatchObject({ roleCode: 'TECHNICIAN', via: ['LAB_MANAGER', 'ANALYST', 'TECHNICIAN'] });

      const karim = await ctx.login(EMAIL.labManager);
      await ctx.http().post('/api/samples').set('Authorization', karim).send(newSample()).expect(403);

      const privilegeId = profile.body.privileges.find((p: { permission: string }) => p.permission === 'sample:create').id;
      await ctx.http().delete(`/api/users/${karimId}/privileges/${privilegeId}`).set('Authorization', superAdmin).expect(200);
      await ctx.http().post('/api/samples').set('Authorization', karim).send(newSample()).expect(201);
    });

    it('refuses privileges on the wildcard or unknown permissions', async () => {
      const superAdmin = await ctx.login(EMAIL.superAdmin);
      const target = await ctx.userId(EMAIL.viewer);
      const wildcard = await ctx.http()
        .post(`/api/users/${target}/privileges`)
        .set('Authorization', superAdmin)
        .send({ permission: '*', effect: 'ALLOW' })
        .expect(400);
      expect(wildcard.body.code).toBe('WILDCARD_PRIVILEGE_FORBIDDEN');
      const unknown = await ctx.http()
        .post(`/api/users/${target}/privileges`)
        .set('Authorization', superAdmin)
        .send({ permission: 'sample:fly', effect: 'ALLOW' })
        .expect(400);
      expect(unknown.body.code).toBe('UNKNOWN_PERMISSION');
    });
  });

  describe('anti-escalation and protections', () => {
    it('prevents granting a permission the actor does not hold', async () => {
      const admin = await ctx.login(EMAIL.admin);
      const response = await ctx.http()
        .post(`/api/users/${await ctx.userId(EMAIL.technician1)}/privileges`)
        .set('Authorization', admin)
        .send({ permission: 'result:validate', effect: 'ALLOW' })
        .expect(403);
      expect(response.body).toMatchObject({ code: 'PRIVILEGE_ESCALATION', details: { missing: ['result:validate'] } });

      const self = await ctx.http()
        .post(`/api/users/${await ctx.userId(EMAIL.admin)}/privileges`)
        .set('Authorization', admin)
        .send({ permission: 'result:validate', effect: 'ALLOW' })
        .expect(403);
      expect(self.body.code).toBe('PRIVILEGE_ESCALATION');
    });

    it('prevents assigning a role whose permissions the actor does not hold', async () => {
      const admin = await ctx.login(EMAIL.admin);
      const created = await ctx.http()
        .post('/api/users')
        .set('Authorization', admin)
        .send({ email: 'new.analyst@aqualab.test', firstName: 'Nouvel', lastName: 'Analyste', password: 'Welcome123' })
        .expect(201);
      const response = await ctx.http()
        .put(`/api/users/${created.body.id}/roles`)
        .set('Authorization', admin)
        .send({ roles: [{ roleId: await ctx.roleId('ANALYST') }] })
        .expect(403);
      expect(response.body.code).toBe('PRIVILEGE_ESCALATION');
      expect(response.body.details.role).toBe('ANALYST');

      // The lab manager holds every ANALYST permission and can habilitate the new user...
      const karim = await ctx.login(EMAIL.labManager);
      await ctx.http()
        .put(`/api/users/${created.body.id}/roles`)
        .set('Authorization', karim)
        .send({ roles: [{ roleId: await ctx.roleId('ANALYST') }] })
        .expect(200);
      // ...but not as quality manager (missing parameter:manage, sampling-point:manage, audit:read).
      const quality = await ctx.http()
        .put(`/api/users/${created.body.id}/roles`)
        .set('Authorization', karim)
        .send({ roles: [{ roleId: await ctx.roleId('ANALYST') }, { roleId: await ctx.roleId('QUALITY_MANAGER') }] })
        .expect(403);
      expect(quality.body.details.missing).toEqual(['audit:read', 'parameter:manage', 'sampling-point:manage']);
    });

    it('forbids changing your own access rights', async () => {
      const karim = await ctx.login(EMAIL.labManager);
      const response = await ctx.http()
        .put(`/api/users/${await ctx.userId(EMAIL.labManager)}/roles`)
        .set('Authorization', karim)
        .send({ roles: [{ roleId: await ctx.roleId('LAB_MANAGER') }, { roleId: await ctx.roleId('VIEWER') }] })
        .expect(403);
      expect(response.body.code).toBe('SELF_MODIFICATION_FORBIDDEN');
    });

    it('protects super administrators from non super administrators', async () => {
      const admin = await ctx.login(EMAIL.admin);
      const response = await ctx.http()
        .patch(`/api/users/${await ctx.userId(EMAIL.superAdmin)}/status`)
        .set('Authorization', admin)
        .send({ status: 'DISABLED' })
        .expect(403);
      expect(response.body.code).toBe('SUPER_ADMIN_PROTECTED');
    });

    it('applies role changes to already connected users immediately', async () => {
      const technician = await ctx.login(EMAIL.technician1);
      const technicianId = await ctx.userId(EMAIL.technician1);
      const karim = await ctx.login(EMAIL.labManager);

      // Promote to ANALYST (temporary role): result entry becomes possible with the same token.
      const inOneWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      await ctx.http()
        .put(`/api/users/${technicianId}/roles`)
        .set('Authorization', karim)
        .send({ roles: [{ roleId: await ctx.roleId('ANALYST'), expiresAt: inOneWeek }] })
        .expect(200);
      let me = (await ctx.http().get('/api/auth/me').set('Authorization', technician)).body;
      expect(me.permissions).toContain('result:enter');

      // Remove every role: the next request is refused.
      await ctx.http().put(`/api/users/${technicianId}/roles`).set('Authorization', karim).send({ roles: [] }).expect(200);
      await ctx.http().get('/api/samples').set('Authorization', technician).expect(403);

      await ctx.http()
        .put(`/api/users/${technicianId}/roles`)
        .set('Authorization', karim)
        .send({ roles: [{ roleId: await ctx.roleId('TECHNICIAN') }] })
        .expect(200);
      me = (await ctx.http().get('/api/auth/me').set('Authorization', technician)).body;
      expect(me.roles.map((role: { code: string }) => role.code)).toEqual(['TECHNICIAN']);
    });

    it('refuses an expiry date in the past', async () => {
      const karim = await ctx.login(EMAIL.labManager);
      const response = await ctx.http()
        .put(`/api/users/${await ctx.userId(EMAIL.viewer)}/roles`)
        .set('Authorization', karim)
        .send({ roles: [{ roleId: await ctx.roleId('VIEWER'), expiresAt: '2020-01-01T00:00:00Z' }] })
        .expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('role management', () => {
    it('creates a custom role inheriting from a built-in one', async () => {
      const superAdmin = await ctx.login(EMAIL.superAdmin);
      const role = await ctx.http()
        .post('/api/roles')
        .set('Authorization', superAdmin)
        .send({
          code: 'SENIOR_TECHNICIAN',
          name: 'Technicien confirmé',
          parentIds: [await ctx.roleId('TECHNICIAN')],
          permissions: ['sample:update:any'],
        })
        .expect(201);
      expect(role.body.permissions).toEqual(['sample:update:any']);
      expect(role.body.effectivePermissions.map((entry: { permission: string }) => entry.permission)).toEqual(
        expect.arrayContaining(['sample:create', 'sample:read', 'sample:update:any']),
      );
    });

    it('refuses inheritance cycles', async () => {
      const superAdmin = await ctx.login(EMAIL.superAdmin);
      const response = await ctx.http()
        .put(`/api/roles/${await ctx.roleId('VIEWER')}/parents`)
        .set('Authorization', superAdmin)
        .send({ parentIds: [await ctx.roleId('LAB_MANAGER')] })
        .expect(400);
      expect(response.body.code).toBe('ROLE_CYCLE');
    });

    it('protects built-in roles', async () => {
      const superAdmin = await ctx.login(EMAIL.superAdmin);
      const superRole = await ctx.http()
        .put(`/api/roles/${await ctx.roleId('SUPER_ADMIN')}/permissions`)
        .set('Authorization', superAdmin)
        .send({ permissions: ['user:read'] })
        .expect(403);
      expect(superRole.body.code).toBe('SYSTEM_ROLE_PROTECTED');
      const deletion = await ctx.http()
        .delete(`/api/roles/${await ctx.roleId('VIEWER')}`)
        .set('Authorization', superAdmin)
        .expect(403);
      expect(deletion.body.code).toBe('SYSTEM_ROLE_PROTECTED');
    });

    it('prevents adding to a role a permission the actor does not hold', async () => {
      const admin = await ctx.login(EMAIL.admin);
      const response = await ctx.http()
        .put(`/api/roles/${await ctx.roleId('ADMIN')}/permissions`)
        .set('Authorization', admin)
        .send({
          permissions: [
            'user:read', 'user:create', 'user:update', 'user:delete', 'user:assign-role',
            'user:manage-privileges', 'role:read', 'role:manage', 'permission:read', 'audit:read',
            'result:validate',
          ],
        })
        .expect(403);
      expect(response.body).toMatchObject({ code: 'PRIVILEGE_ESCALATION', details: { missing: ['result:validate'] } });
    });

    it('refuses to delete a role still assigned', async () => {
      const superAdmin = await ctx.login(EMAIL.superAdmin);
      const role = await ctx.http()
        .post('/api/roles')
        .set('Authorization', superAdmin)
        .send({ code: 'TEMP_ROLE', name: 'Temporaire', permissions: ['sample:read'] })
        .expect(201);
      await ctx.http()
        .put(`/api/users/${await ctx.userId(EMAIL.viewer)}/roles`)
        .set('Authorization', superAdmin)
        .send({ roles: [{ roleId: await ctx.roleId('VIEWER') }, { roleId: role.body.id }] })
        .expect(200);
      const inUse = await ctx.http().delete(`/api/roles/${role.body.id}`).set('Authorization', superAdmin).expect(409);
      expect(inUse.body.code).toBe('ROLE_IN_USE');
    });
  });

  describe('access tester', () => {
    it('explains a permission inherited through several roles', async () => {
      const admin = await ctx.login(EMAIL.admin);
      const response = await ctx.http()
        .post('/api/authz/check')
        .set('Authorization', admin)
        .send({ userId: await ctx.userId(EMAIL.labManager), permission: 'sample:read' })
        .expect(200);
      expect(response.body).toMatchObject({ allowed: true, outcome: 'GRANTED' });
      expect(response.body.decision.grants[0].via).toEqual(['LAB_MANAGER', 'ANALYST', 'TECHNICIAN', 'VIEWER']);
    });

    it('reports permissions that are not granted', async () => {
      const admin = await ctx.login(EMAIL.admin);
      const response = await ctx.http()
        .post('/api/authz/check')
        .set('Authorization', admin)
        .send({ userId: await ctx.userId(EMAIL.viewer), permission: 'result:enter' })
        .expect(200);
      expect(response.body).toMatchObject({ allowed: false, outcome: 'NOT_GRANTED' });
    });
  });
});
