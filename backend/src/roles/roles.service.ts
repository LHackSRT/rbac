import { Injectable } from '@nestjs/common';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { ROLE } from '../authorization/catalog';
import { wouldCreateCycle } from '../authorization/permission-resolver';
import { AppError, ErrorCode } from '../common/errors';
import type { AuthContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/roles.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  /** Roles with their parents, own permissions and effective (own + inherited) permissions. */
  async list() {
    const [roles, effective] = await Promise.all([
      this.prisma.role.findMany({
        orderBy: { code: 'asc' },
        include: {
          parents: { include: { parent: { select: { id: true, code: true, name: true } } } },
          children: { include: { role: { select: { id: true, code: true, name: true } } } },
          permissions: { include: { permission: { select: { code: true } } } },
          _count: { select: { users: true } },
        },
      }),
      this.authorization.rolePermissionMap(),
    ]);
    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      parents: role.parents.map((link) => link.parent),
      children: role.children.map((link) => link.role),
      permissions: role.permissions.map((link) => link.permission.code).sort(),
      effectivePermissions: effective.get(role.id) ?? [],
      userCount: role._count.users,
    }));
  }

  async get(roleId: string) {
    const role = (await this.list()).find((candidate) => candidate.id === roleId);
    if (!role) throw AppError.notFound('Role');
    return role;
  }

  async create(actor: AuthContext, dto: CreateRoleDto) {
    if (await this.prisma.role.findUnique({ where: { code: dto.code } })) {
      throw AppError.conflict(ErrorCode.ROLE_CODE_ALREADY_USED, 'Role code already used');
    }
    const permissionIds = await this.permissionIds(dto.permissions ?? []);
    const parentIds = dto.parentIds ?? [];
    this.authorization.assertHoldsAll(actor, dto.permissions ?? [], { role: dto.code });
    await this.assertCanHandleParents(actor, parentIds);

    const role = await this.prisma.role.create({
      data: {
        code: dto.code,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        parents: { create: parentIds.map((parentId) => ({ parentId })) },
        permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
    });
    await this.audit.logAs(actor, AuditAction.ROLE_CREATED, { type: 'role', id: role.id }, {
      code: role.code,
      permissions: dto.permissions ?? [],
      parentIds,
    });
    return this.get(role.id);
  }

  async update(actor: AuthContext, roleId: string, dto: UpdateRoleDto) {
    const role = await this.findOrThrow(roleId);
    this.assertNotSuperAdminRole(role.code);
    await this.prisma.role.update({
      where: { id: roleId },
      data: {
        name: dto.name?.trim(),
        description: dto.description === undefined ? undefined : dto.description.trim() || null,
      },
    });
    await this.audit.logAs(actor, AuditAction.ROLE_UPDATED, { type: 'role', id: roleId }, { code: role.code, ...dto });
    return this.get(roleId);
  }

  /** Replaces the own permissions of a role. Only permissions held by the actor can be added or removed. */
  async setPermissions(actor: AuthContext, roleId: string, codes: string[]) {
    const role = await this.findOrThrow(roleId);
    this.assertNotSuperAdminRole(role.code);
    const permissionIds = await this.permissionIds(codes);
    const current = role.permissions.map((link) => link.permission.code);
    const added = codes.filter((code) => !current.includes(code));
    const removed = current.filter((code) => !codes.includes(code));
    if (added.length === 0 && removed.length === 0) return this.get(roleId);

    this.authorization.assertHoldsAll(actor, [...added, ...removed], { role: role.code });
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      }),
    ]);
    await this.audit.logAs(actor, AuditAction.ROLE_PERMISSIONS_CHANGED, { type: 'role', id: roleId }, {
      code: role.code,
      added,
      removed,
    });
    return this.get(roleId);
  }

  /** Replaces the parents of a role, refusing cycles. */
  async setParents(actor: AuthContext, roleId: string, parentIds: string[]) {
    const role = await this.findOrThrow(roleId);
    this.assertNotSuperAdminRole(role.code);
    const current = role.parents.map((link) => link.parentId);
    const added = parentIds.filter((id) => !current.includes(id));
    const removed = current.filter((id) => !parentIds.includes(id));
    if (added.length === 0 && removed.length === 0) return this.get(roleId);

    const graph = await this.authorization.loadRoleGraph();
    const rolesById = new Map(graph.map((node) => [node.id, node]));
    for (const parentId of added) {
      const parent = rolesById.get(parentId);
      if (!parent) throw AppError.notFound('Parent role');
      if (wouldCreateCycle(roleId, parentId, rolesById)) {
        throw AppError.badRequest(ErrorCode.ROLE_CYCLE, 'This inheritance would create a cycle', {
          role: role.code,
          parent: parent.code,
        });
      }
    }
    await this.assertCanHandleParents(actor, [...added, ...removed]);

    await this.prisma.$transaction([
      this.prisma.roleParent.deleteMany({ where: { roleId, parentId: { in: removed } } }),
      this.prisma.roleParent.createMany({ data: added.map((parentId) => ({ roleId, parentId })) }),
    ]);
    await this.audit.logAs(actor, AuditAction.ROLE_PARENTS_CHANGED, { type: 'role', id: roleId }, {
      code: role.code,
      added: added.map((id) => rolesById.get(id)?.code),
      removed: removed.map((id) => rolesById.get(id)?.code),
    });
    return this.get(roleId);
  }

  async remove(actor: AuthContext, roleId: string) {
    const role = await this.findOrThrow(roleId);
    if (role.isSystem) {
      throw AppError.forbidden(ErrorCode.SYSTEM_ROLE_PROTECTED, 'Built-in roles cannot be deleted');
    }
    const [userCount, childCount] = await Promise.all([
      this.prisma.userRole.count({ where: { roleId } }),
      this.prisma.roleParent.count({ where: { parentId: roleId } }),
    ]);
    if (userCount > 0 || childCount > 0) {
      throw AppError.conflict(ErrorCode.ROLE_IN_USE, 'Role is assigned to users or inherited by other roles', {
        userCount,
        childCount,
      });
    }
    const effective = (await this.authorization.rolePermissionMap()).get(roleId) ?? [];
    this.authorization.assertHoldsAll(
      actor,
      effective.map((entry) => entry.permission),
      { role: role.code },
    );
    await this.prisma.role.delete({ where: { id: roleId } });
    await this.audit.logAs(actor, AuditAction.ROLE_DELETED, { type: 'role', id: roleId }, { code: role.code });
  }

  private async findOrThrow(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { parents: true, permissions: { include: { permission: true } } },
    });
    if (!role) throw AppError.notFound('Role');
    return role;
  }

  /** The super administrator role is immutable so that "*" can never be lost or diluted. */
  private assertNotSuperAdminRole(code: string) {
    if (code === ROLE.SUPER_ADMIN) {
      throw AppError.forbidden(ErrorCode.SYSTEM_ROLE_PROTECTED, 'The super administrator role cannot be modified');
    }
  }

  private async permissionIds(codes: string[]): Promise<string[]> {
    const permissions = await this.prisma.permission.findMany({ where: { code: { in: codes } } });
    const unknown = codes.filter((code) => !permissions.some((permission) => permission.code === code));
    if (unknown.length > 0) {
      throw AppError.badRequest(ErrorCode.UNKNOWN_PERMISSION, 'Unknown permission', { unknown });
    }
    return permissions.map((permission) => permission.id);
  }

  /** Inheriting from a role grants all its permissions: the actor must hold them. */
  private async assertCanHandleParents(actor: AuthContext, parentIds: string[]) {
    if (parentIds.length === 0) return;
    const effective = await this.authorization.rolePermissionMap();
    for (const parentId of parentIds) {
      const entries = effective.get(parentId);
      if (!entries) throw AppError.notFound('Parent role');
      this.authorization.assertHoldsAll(
        actor,
        entries.map((entry) => entry.permission),
        { parentRoleId: parentId },
      );
    }
  }
}
