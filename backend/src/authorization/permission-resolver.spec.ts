import {
  RoleGraphNode,
  resolveEffectivePermissions,
  resolveRolePermissions,
  walkRoleAncestors,
  wouldCreateCycle,
} from './permission-resolver';

const now = new Date('2026-10-01T12:00:00Z');
const past = new Date('2026-09-01T00:00:00Z');
const future = new Date('2026-11-01T00:00:00Z');

const catalog = ['*', 'sample:read', 'sample:create', 'result:enter', 'result:validate', 'parameter:manage', 'user:read'];

//   VIEWER
//    ├── TECHNICIAN
//    │    └── ANALYST
//    │         └── LAB_MANAGER
//    └── QUALITY_MANAGER
//   SUPER_ADMIN (*)
const roles: RoleGraphNode[] = [
  { id: 'viewer', code: 'VIEWER', name: 'Consultant', parentIds: [], permissionCodes: ['sample:read'] },
  { id: 'tech', code: 'TECHNICIAN', name: 'Technicien', parentIds: ['viewer'], permissionCodes: ['sample:create'] },
  { id: 'analyst', code: 'ANALYST', name: 'Analyste', parentIds: ['tech'], permissionCodes: ['result:enter'] },
  { id: 'manager', code: 'LAB_MANAGER', name: 'Resp. labo', parentIds: ['analyst'], permissionCodes: ['result:validate'] },
  { id: 'quality', code: 'QUALITY_MANAGER', name: 'Resp. qualité', parentIds: ['viewer'], permissionCodes: ['parameter:manage'] },
  { id: 'super', code: 'SUPER_ADMIN', name: 'Super admin', parentIds: [], permissionCodes: ['*'] },
];

function resolve(assignments: { roleId: string; expiresAt?: Date | null }[], privileges: Parameters<typeof resolveEffectivePermissions>[0]['privileges'] = []) {
  return resolveEffectivePermissions({
    roles,
    catalog,
    now,
    assignments: assignments.map((assignment) => ({ roleId: assignment.roleId, expiresAt: assignment.expiresAt ?? null })),
    privileges,
  });
}

describe('resolveEffectivePermissions', () => {
  it('grants nothing without roles nor privileges', () => {
    const permissions = resolve([]);
    expect(permissions.list()).toEqual([]);
    expect(permissions.has('sample:read')).toBe(false);
  });

  it('inherits permissions from every ancestor role', () => {
    const permissions = resolve([{ roleId: 'manager' }]);
    expect(permissions.list()).toEqual(['result:enter', 'result:validate', 'sample:create', 'sample:read']);
  });

  it('explains the inheritance chain', () => {
    const decision = resolve([{ roleId: 'manager' }]).explain('sample:read');
    expect(decision.allowed).toBe(true);
    expect(decision.grants).toEqual([
      { type: 'ROLE', roleCode: 'VIEWER', roleName: 'Consultant', via: ['LAB_MANAGER', 'ANALYST', 'TECHNICIAN', 'VIEWER'], wildcard: false },
    ]);
  });

  it('keeps sibling branches separate', () => {
    const quality = resolve([{ roleId: 'quality' }]);
    expect(quality.has('parameter:manage')).toBe(true);
    expect(quality.has('sample:read')).toBe(true);
    expect(quality.has('sample:create')).toBe(false);
    expect(resolve([{ roleId: 'tech' }]).has('parameter:manage')).toBe(false);
  });

  it('ignores expired role assignments', () => {
    const permissions = resolve([{ roleId: 'analyst', expiresAt: past }, { roleId: 'viewer', expiresAt: future }]);
    expect(permissions.has('result:enter')).toBe(false);
    expect(permissions.has('sample:read')).toBe(true);
  });

  it('expands the wildcard to the whole catalog', () => {
    const permissions = resolve([{ roleId: 'super' }]);
    expect(permissions.list()).toEqual([...catalog].sort());
    expect(permissions.explain('user:read').grants[0]).toMatchObject({ type: 'ROLE', roleCode: 'SUPER_ADMIN', wildcard: true });
  });

  it('adds active ALLOW privileges', () => {
    const permissions = resolve(
      [{ roleId: 'analyst' }],
      [{ id: 'p1', permissionCode: 'result:validate', effect: 'ALLOW', reason: 'Intérim', expiresAt: future }],
    );
    expect(permissions.has('result:validate')).toBe(true);
    expect(permissions.explain('result:validate').grants).toEqual([
      { type: 'PRIVILEGE', privilegeId: 'p1', reason: 'Intérim', expiresAt: future },
    ]);
  });

  it('ignores expired privileges', () => {
    const permissions = resolve(
      [{ roleId: 'analyst' }],
      [
        { id: 'p1', permissionCode: 'result:validate', effect: 'ALLOW', reason: null, expiresAt: past },
        { id: 'p2', permissionCode: 'result:enter', effect: 'DENY', reason: null, expiresAt: past },
      ],
    );
    expect(permissions.has('result:validate')).toBe(false);
    expect(permissions.has('result:enter')).toBe(true);
  });

  it('lets a DENY privilege win over roles, inheritance and the wildcard', () => {
    const deny = (code: string) => [{ id: 'd', permissionCode: code, effect: 'DENY' as const, reason: 'Suspendu', expiresAt: null }];

    const analyst = resolve([{ roleId: 'analyst' }], deny('result:enter'));
    expect(analyst.has('result:enter')).toBe(false);
    expect(analyst.has('sample:create')).toBe(true);
    expect(analyst.explain('result:enter').denial).toEqual({ privilegeId: 'd', reason: 'Suspendu', expiresAt: null });

    expect(resolve([{ roleId: 'manager' }], deny('sample:read')).has('sample:read')).toBe(false);
    expect(resolve([{ roleId: 'super' }], deny('user:read')).has('user:read')).toBe(false);
  });

  it('lets a DENY privilege win over an ALLOW privilege', () => {
    const permissions = resolve(
      [],
      [
        { id: 'a', permissionCode: 'result:validate', effect: 'ALLOW', reason: null, expiresAt: null },
        { id: 'd', permissionCode: 'result:validate', effect: 'DENY', reason: null, expiresAt: null },
      ],
    );
    expect(permissions.has('result:validate')).toBe(false);
  });

  it('lists one grant per role holding the permission', () => {
    const decision = resolve([{ roleId: 'tech' }, { roleId: 'quality' }]).explain('sample:read');
    expect(decision.grants).toHaveLength(1);
    expect(resolve([{ roleId: 'tech' }, { roleId: 'quality' }]).hasAll(['sample:create', 'parameter:manage'])).toBe(true);
  });

  it('survives cycles in the role graph', () => {
    const cyclic: RoleGraphNode[] = [
      { id: 'a', code: 'A', name: 'A', parentIds: ['b'], permissionCodes: ['sample:read'] },
      { id: 'b', code: 'B', name: 'B', parentIds: ['a'], permissionCodes: ['sample:create'] },
    ];
    const permissions = resolveEffectivePermissions({ roles: cyclic, catalog, now, assignments: [{ roleId: 'a', expiresAt: null }], privileges: [] });
    expect(permissions.list()).toEqual(['sample:create', 'sample:read']);
  });
});

describe('role graph helpers', () => {
  const rolesById = new Map(roles.map((role) => [role.id, role]));

  it('walks ancestors breadth-first', () => {
    expect(walkRoleAncestors('manager', rolesById).map((reached) => reached.node.code)).toEqual([
      'LAB_MANAGER',
      'ANALYST',
      'TECHNICIAN',
      'VIEWER',
    ]);
  });

  it('detects cycles', () => {
    expect(wouldCreateCycle('viewer', 'manager', rolesById)).toBe(true);
    expect(wouldCreateCycle('viewer', 'viewer', rolesById)).toBe(true);
    expect(wouldCreateCycle('quality', 'analyst', rolesById)).toBe(false);
  });

  it('resolves own and inherited permissions of a role', () => {
    expect(resolveRolePermissions('analyst', roles, catalog)).toEqual([
      { permission: 'result:enter', inherited: false, fromRoleCode: 'ANALYST' },
      { permission: 'sample:create', inherited: true, fromRoleCode: 'TECHNICIAN' },
      { permission: 'sample:read', inherited: true, fromRoleCode: 'VIEWER' },
    ]);
  });
});
