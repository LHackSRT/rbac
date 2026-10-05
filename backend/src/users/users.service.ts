import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { P, WILDCARD } from '../authorization/catalog';
import { AppError, ErrorCode } from '../common/errors';
import { Page, paginationArgs } from '../common/pagination';
import type { AuthContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateUserDto,
  GrantPrivilegeDto,
  ListUsersQuery,
  RoleAssignmentDto,
  UpdateStatusDto,
  UpdateUserDto,
} from './dto/users.dto';

const userRefSelect = { id: true, email: true, firstName: true, lastName: true } as const;

function isActive(expiresAt: Date | null, now: Date) {
  return expiresAt === null || expiresAt > now;
}

function sameDate(a: Date | null | undefined, b: Date | null | undefined) {
  return (a?.getTime() ?? null) === (b?.getTime() ?? null);
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListUsersQuery): Promise<Page<unknown>> {
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      status: query.status,
      roles: query.roleId ? { some: { roleId: query.roleId } } : undefined,
      OR: search
        ? [
            { email: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const now = new Date();
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        include: {
          roles: { include: { role: { select: { id: true, code: true, name: true } } } },
          _count: { select: { privileges: true } },
        },
        ...paginationArgs(query),
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: users.map((user) => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        lockedUntil: user.lockedUntil,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        roles: user.roles.map((assignment) => ({
          ...assignment.role,
          expiresAt: assignment.expiresAt,
          active: isActive(assignment.expiresAt, now),
        })),
        privilegeCount: user._count.privileges,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Full user profile: roles, privileges and effective permissions with explanations. */
  async profile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: { role: { select: { id: true, code: true, name: true } }, assignedBy: { select: userRefSelect } },
          orderBy: { assignedAt: 'asc' },
        },
        privileges: {
          include: { permission: { select: { code: true, description: true } }, grantedBy: { select: userRefSelect } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user) throw AppError.notFound('User');
    const [permissions, catalog] = await Promise.all([
      this.authorization.permissionsOf(userId),
      this.prisma.permission.findMany({ select: { code: true, description: true } }),
    ]);
    const descriptions = new Map(catalog.map((permission) => [permission.code, permission.description]));
    const now = new Date();
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roles: user.roles.map((assignment) => ({
        roleId: assignment.role.id,
        code: assignment.role.code,
        name: assignment.role.name,
        assignedAt: assignment.assignedAt,
        expiresAt: assignment.expiresAt,
        active: isActive(assignment.expiresAt, now),
        assignedBy: assignment.assignedBy,
      })),
      privileges: user.privileges.map((privilege) => ({
        id: privilege.id,
        permission: privilege.permission.code,
        permissionDescription: privilege.permission.description,
        effect: privilege.effect,
        reason: privilege.reason,
        createdAt: privilege.createdAt,
        expiresAt: privilege.expiresAt,
        active: isActive(privilege.expiresAt, now),
        grantedBy: privilege.grantedBy,
      })),
      permissions: permissions.list(),
      decisions: permissions.decisionsList().map((decision) => ({
        ...decision,
        description: descriptions.get(decision.permission) ?? null,
      })),
    };
  }

  async create(actor: AuthContext, dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    this.passwords.assertStrong(dto.password);
    await this.assertEmailFree(email);

    const roleIds = dto.roleIds ?? [];
    if (roleIds.length > 0) {
      if (!actor.permissions.has(P.USER_ASSIGN_ROLE)) {
        throw AppError.forbidden(ErrorCode.FORBIDDEN, 'Missing permission', {
          mode: 'all',
          required: [P.USER_ASSIGN_ROLE],
          missing: [P.USER_ASSIGN_ROLE],
        });
      }
      await this.assertCanHandleRoles(actor, roleIds);
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        passwordHash: await this.passwords.hash(dto.password),
        roles: { create: roleIds.map((roleId) => ({ roleId, assignedById: actor.user.id })) },
      },
    });
    await this.audit.logAs(actor, AuditAction.USER_CREATED, { type: 'user', id: user.id }, { email, roleIds });
    return this.profile(user.id);
  }

  async update(actor: AuthContext, userId: string, dto: UpdateUserDto) {
    await this.findOrThrow(userId);
    await this.authorization.assertCanManageUser(actor, userId);
    const data: Prisma.UserUpdateInput = {};
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      await this.assertEmailFree(email, userId);
      data.email = email;
    }
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    await this.prisma.user.update({ where: { id: userId }, data });
    await this.audit.logAs(actor, AuditAction.USER_UPDATED, { type: 'user', id: userId }, { ...dto });
    return this.profile(userId);
  }

  /** Enables or disables an account. Disabling revokes every session immediately. */
  async setStatus(actor: AuthContext, userId: string, dto: UpdateStatusDto) {
    await this.findOrThrow(userId);
    this.authorization.assertNotSelf(actor, userId);
    await this.authorization.assertCanManageUser(actor, userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: dto.status, failedLoginAttempts: 0, lockedUntil: null },
    });
    if (dto.status === UserStatus.DISABLED) await this.tokens.revokeAll(userId);
    await this.audit.logAs(actor, AuditAction.USER_STATUS_CHANGED, { type: 'user', id: userId }, { status: dto.status });
    return this.profile(userId);
  }

  async unlock(actor: AuthContext, userId: string) {
    const user = await this.findOrThrow(userId);
    await this.authorization.assertCanManageUser(actor, userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: user.status === UserStatus.LOCKED ? UserStatus.ACTIVE : user.status,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    await this.audit.logAs(actor, AuditAction.USER_UNLOCKED, { type: 'user', id: userId });
    return this.profile(userId);
  }

  async resetPassword(actor: AuthContext, userId: string, newPassword: string) {
    await this.findOrThrow(userId);
    this.authorization.assertNotSelf(actor, userId);
    await this.authorization.assertCanManageUser(actor, userId);
    this.passwords.assertStrong(newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hash(newPassword) },
    });
    await this.tokens.revokeAll(userId);
    await this.audit.logAs(actor, AuditAction.USER_PASSWORD_RESET, { type: 'user', id: userId });
  }

  async remove(actor: AuthContext, userId: string) {
    const user = await this.findOrThrow(userId);
    this.authorization.assertNotSelf(actor, userId);
    await this.authorization.assertCanManageUser(actor, userId);
    try {
      await this.prisma.user.delete({ where: { id: userId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw AppError.conflict(
          ErrorCode.IN_USE,
          'This user is referenced by laboratory records; disable the account instead',
        );
      }
      throw error;
    }
    await this.audit.logAs(actor, AuditAction.USER_DELETED, { type: 'user', id: userId }, { email: user.email });
  }

  /**
   * Replaces the role assignments of a user. The actor must hold every
   * permission of each role added, removed or whose expiry changes.
   */
  async setRoles(actor: AuthContext, userId: string, assignments: RoleAssignmentDto[]) {
    await this.findOrThrow(userId);
    const now = new Date();
    const requested = new Map<string, Date | null>();
    for (const assignment of assignments) {
      if (assignment.expiresAt && assignment.expiresAt <= now) {
        throw AppError.badRequest(ErrorCode.VALIDATION_ERROR, 'Expiry date must be in the future', [
          { field: 'roles.expiresAt', errors: ['expiresAt must be in the future'] },
        ]);
      }
      requested.set(assignment.roleId, assignment.expiresAt ?? null);
    }

    const current = await this.prisma.userRole.findMany({ where: { userId } });
    const currentByRole = new Map(current.map((assignment) => [assignment.roleId, assignment]));
    const added = [...requested.keys()].filter((roleId) => !currentByRole.has(roleId));
    const removed = current.filter((assignment) => !requested.has(assignment.roleId)).map((a) => a.roleId);
    const changed = [...requested.entries()]
      .filter(([roleId, expiresAt]) => {
        const existing = currentByRole.get(roleId);
        return existing !== undefined && !sameDate(existing.expiresAt, expiresAt);
      })
      .map(([roleId]) => roleId);

    const touched = [...added, ...removed, ...changed];
    if (touched.length === 0) return this.profile(userId);

    await this.assertCanHandleRoles(actor, touched);
    this.authorization.assertNotSelf(actor, userId);
    await this.authorization.assertCanManageUser(actor, userId);

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId, roleId: { in: removed } } }),
      ...[...added, ...changed].map((roleId) =>
        this.prisma.userRole.upsert({
          where: { userId_roleId: { userId, roleId } },
          create: { userId, roleId, expiresAt: requested.get(roleId), assignedById: actor.user.id },
          update: { expiresAt: requested.get(roleId), assignedById: actor.user.id, assignedAt: now },
        }),
      ),
    ]);

    const codes = await this.roleCodes(touched);
    await this.audit.logAs(actor, AuditAction.USER_ROLES_CHANGED, { type: 'user', id: userId }, {
      added: added.map((id) => codes.get(id)),
      removed: removed.map((id) => codes.get(id)),
      expiryChanged: changed.map((id) => codes.get(id)),
    });
    return this.profile(userId);
  }

  /** Grants an individual ALLOW or DENY privilege (replaces any existing one on the same permission). */
  async grantPrivilege(actor: AuthContext, userId: string, dto: GrantPrivilegeDto) {
    await this.findOrThrow(userId);
    if (dto.permission === WILDCARD) {
      throw AppError.badRequest(ErrorCode.WILDCARD_PRIVILEGE_FORBIDDEN, 'The "*" permission can only be granted through a role');
    }
    const permission = await this.prisma.permission.findUnique({ where: { code: dto.permission } });
    if (!permission) {
      throw AppError.badRequest(ErrorCode.UNKNOWN_PERMISSION, 'Unknown permission', { permission: dto.permission });
    }
    if (dto.expiresAt && dto.expiresAt <= new Date()) {
      throw AppError.badRequest(ErrorCode.VALIDATION_ERROR, 'Expiry date must be in the future', [
        { field: 'expiresAt', errors: ['expiresAt must be in the future'] },
      ]);
    }
    this.authorization.assertHoldsAll(actor, [permission.code], { permission: permission.code });
    this.authorization.assertNotSelf(actor, userId);
    await this.authorization.assertCanManageUser(actor, userId);

    const data = {
      effect: dto.effect,
      reason: dto.reason?.trim() || null,
      expiresAt: dto.expiresAt ?? null,
      grantedById: actor.user.id,
      createdAt: new Date(),
    };
    const privilege = await this.prisma.userPrivilege.upsert({
      where: { userId_permissionId: { userId, permissionId: permission.id } },
      create: { userId, permissionId: permission.id, ...data },
      update: data,
    });
    await this.audit.logAs(actor, AuditAction.USER_PRIVILEGE_GRANTED, { type: 'user', id: userId }, {
      privilegeId: privilege.id,
      permission: permission.code,
      effect: dto.effect,
      reason: data.reason,
      expiresAt: data.expiresAt,
    });
    return this.profile(userId);
  }

  async revokePrivilege(actor: AuthContext, userId: string, privilegeId: string) {
    const privilege = await this.prisma.userPrivilege.findFirst({
      where: { id: privilegeId, userId },
      include: { permission: true },
    });
    if (!privilege) throw AppError.notFound('Privilege');
    this.authorization.assertHoldsAll(actor, [privilege.permission.code], { permission: privilege.permission.code });
    this.authorization.assertNotSelf(actor, userId);
    await this.authorization.assertCanManageUser(actor, userId);
    await this.prisma.userPrivilege.delete({ where: { id: privilegeId } });
    await this.audit.logAs(actor, AuditAction.USER_PRIVILEGE_REVOKED, { type: 'user', id: userId }, {
      privilegeId,
      permission: privilege.permission.code,
      effect: privilege.effect,
    });
    return this.profile(userId);
  }

  private async findOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User');
    return user;
  }

  private async assertEmailFree(email: string, exceptUserId?: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== exceptUserId) {
      throw new AppError(HttpStatus.CONFLICT, ErrorCode.EMAIL_ALREADY_USED, 'E-mail already used');
    }
  }

  /** The actor must hold every permission (own and inherited) of each role. */
  private async assertCanHandleRoles(actor: AuthContext, roleIds: string[]) {
    const rolePermissions = await this.authorization.rolePermissionMap();
    const codes = await this.roleCodes(roleIds);
    for (const roleId of roleIds) {
      const entries = rolePermissions.get(roleId);
      if (!entries) throw AppError.notFound('Role');
      this.authorization.assertHoldsAll(
        actor,
        entries.map((entry) => entry.permission),
        { role: codes.get(roleId) },
      );
    }
  }

  private async roleCodes(roleIds: string[]): Promise<Map<string, string>> {
    const roles = await this.prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, code: true } });
    return new Map(roles.map((role) => [role.id, role.code]));
  }
}
