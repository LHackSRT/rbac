import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors';
import type { AuthContext, AuthenticatedUser } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { WILDCARD } from './catalog';
import {
  EffectivePermissions,
  RoleGraphNode,
  RolePermissionEntry,
  resolveEffectivePermissions,
  resolveRolePermissions,
} from './permission-resolver';

export interface UserAccessContext {
  user: AuthenticatedUser & { status: UserStatus };
  permissions: EffectivePermissions;
}

/**
 * Loads RBAC data from the database and delegates the computation to the pure
 * resolver. Permissions are recomputed on every request, so revoking a role or
 * adding a DENY privilege takes effect immediately.
 */
@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async loadRoleGraph(): Promise<RoleGraphNode[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: { code: 'asc' },
      include: { parents: true, permissions: { include: { permission: true } } },
    });
    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      parentIds: role.parents.map((link) => link.parentId),
      permissionCodes: role.permissions.map((link) => link.permission.code),
    }));
  }

  async loadCatalog(): Promise<string[]> {
    const permissions = await this.prisma.permission.findMany({ select: { code: true } });
    return permissions.map((permission) => permission.code);
  }

  /** Returns null when the user does not exist. */
  async loadUserAccess(userId: string, now = new Date()): Promise<UserAccessContext | null> {
    const [user, roles, catalog] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          roles: true,
          privileges: { include: { permission: { select: { code: true } } } },
        },
      }),
      this.loadRoleGraph(),
      this.loadCatalog(),
    ]);
    if (!user) return null;

    const permissions =
      user.status === UserStatus.DISABLED
        ? EffectivePermissions.empty()
        : resolveEffectivePermissions({
            roles,
            catalog,
            now,
            assignments: user.roles.map((assignment) => ({
              roleId: assignment.roleId,
              expiresAt: assignment.expiresAt,
            })),
            privileges: user.privileges.map((privilege) => ({
              id: privilege.id,
              permissionCode: privilege.permission.code,
              effect: privilege.effect,
              reason: privilege.reason,
              expiresAt: privilege.expiresAt,
            })),
          });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
      },
      permissions,
    };
  }

  async permissionsOf(userId: string): Promise<EffectivePermissions> {
    return (await this.loadUserAccess(userId))?.permissions ?? EffectivePermissions.empty();
  }

  /** Permissions of each role, own and inherited. */
  async rolePermissionMap(): Promise<Map<string, RolePermissionEntry[]>> {
    const [roles, catalog] = await Promise.all([this.loadRoleGraph(), this.loadCatalog()]);
    return new Map(roles.map((role) => [role.id, resolveRolePermissions(role.id, roles, catalog)]));
  }

  /**
   * Anti-escalation rule: an actor can only grant, withdraw or delegate
   * permissions they hold themselves.
   */
  assertHoldsAll(actor: AuthContext, permissions: Iterable<string>, context: Record<string, unknown> = {}) {
    const missing = [...new Set(permissions)].filter((code) => !actor.permissions.has(code)).sort();
    if (missing.length > 0) {
      throw AppError.forbidden(
        ErrorCode.PRIVILEGE_ESCALATION,
        'You cannot grant or withdraw permissions you do not hold yourself',
        { ...context, missing },
      );
    }
  }

  /** Only a super administrator may manage another super administrator. */
  async assertCanManageUser(actor: AuthContext, targetUserId: string) {
    const target = await this.permissionsOf(targetUserId);
    if (target.has(WILDCARD) && !actor.permissions.has(WILDCARD)) {
      throw AppError.forbidden(
        ErrorCode.SUPER_ADMIN_PROTECTED,
        'Only a super administrator can manage a super administrator',
      );
    }
  }

  assertNotSelf(actor: AuthContext, targetUserId: string) {
    if (actor.user.id === targetUserId) {
      throw AppError.forbidden(
        ErrorCode.SELF_MODIFICATION_FORBIDDEN,
        'You cannot change your own access rights, status or account',
      );
    }
  }
}
