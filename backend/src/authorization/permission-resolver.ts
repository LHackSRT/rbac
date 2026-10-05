import { WILDCARD } from './catalog';

/**
 * Pure RBAC resolution engine (no I/O), so it can be unit tested in isolation.
 *
 * Effective permissions of a user =
 *     permissions of every active role and of all their ancestor roles
 *   + active ALLOW privileges
 *   - active DENY privileges (a DENY always wins)
 * The "*" permission expands to the whole catalog.
 */

export interface RoleGraphNode {
  id: string;
  code: string;
  name: string;
  parentIds: string[];
  permissionCodes: string[];
}

export interface RoleAssignmentInput {
  roleId: string;
  expiresAt: Date | null;
}

export interface PrivilegeInput {
  id: string;
  permissionCode: string;
  effect: 'ALLOW' | 'DENY';
  reason: string | null;
  expiresAt: Date | null;
}

export type Grant =
  | {
      type: 'ROLE';
      /** Role that directly holds the permission. */
      roleCode: string;
      roleName: string;
      /** Inheritance chain from the role assigned to the user down to `roleCode`. */
      via: string[];
      /** True when the permission comes from the "*" wildcard. */
      wildcard: boolean;
    }
  | {
      type: 'PRIVILEGE';
      privilegeId: string;
      reason: string | null;
      expiresAt: Date | null;
    };

export interface Denial {
  privilegeId: string;
  reason: string | null;
  expiresAt: Date | null;
}

export interface PermissionDecision {
  permission: string;
  allowed: boolean;
  grants: Grant[];
  denial: Denial | null;
}

export class EffectivePermissions {
  constructor(private readonly decisions: Map<string, PermissionDecision>) {}

  static empty(): EffectivePermissions {
    return new EffectivePermissions(new Map());
  }

  has(code: string): boolean {
    return this.decisions.get(code)?.allowed ?? false;
  }

  hasAll(codes: readonly string[]): boolean {
    return codes.every((code) => this.has(code));
  }

  hasAny(codes: readonly string[]): boolean {
    return codes.some((code) => this.has(code));
  }

  explain(code: string): PermissionDecision {
    return this.decisions.get(code) ?? { permission: code, allowed: false, grants: [], denial: null };
  }

  /** Allowed permission codes, sorted. */
  list(): string[] {
    return [...this.decisions.values()]
      .filter((decision) => decision.allowed)
      .map((decision) => decision.permission)
      .sort();
  }

  /** Every permission that is granted or denied, with its explanation. */
  decisionsList(): PermissionDecision[] {
    return [...this.decisions.values()].sort((a, b) => a.permission.localeCompare(b.permission));
  }
}

function isActive(expiresAt: Date | null, now: Date): boolean {
  return expiresAt === null || expiresAt.getTime() > now.getTime();
}

interface ReachedRole {
  node: RoleGraphNode;
  /** Codes from the starting role to this role (both included). */
  path: string[];
}

/** Breadth-first walk of a role and its ancestors. Cycles are ignored. */
export function walkRoleAncestors(
  startRoleId: string,
  rolesById: Map<string, RoleGraphNode>,
): ReachedRole[] {
  const start = rolesById.get(startRoleId);
  if (!start) return [];
  const reached: ReachedRole[] = [];
  const visited = new Set<string>([start.id]);
  const queue: ReachedRole[] = [{ node: start, path: [start.code] }];
  while (queue.length > 0) {
    const current = queue.shift()!;
    reached.push(current);
    for (const parentId of current.node.parentIds) {
      const parent = rolesById.get(parentId);
      if (!parent || visited.has(parent.id)) continue;
      visited.add(parent.id);
      queue.push({ node: parent, path: [...current.path, parent.code] });
    }
  }
  return reached;
}

/** True if `candidateParentId` already inherits (directly or not) from `roleId`. */
export function wouldCreateCycle(
  roleId: string,
  candidateParentId: string,
  rolesById: Map<string, RoleGraphNode>,
): boolean {
  if (roleId === candidateParentId) return true;
  return walkRoleAncestors(candidateParentId, rolesById).some((reached) => reached.node.id === roleId);
}

export interface ResolveInput {
  roles: RoleGraphNode[];
  assignments: RoleAssignmentInput[];
  privileges: PrivilegeInput[];
  /** Every known permission code, used to expand "*". */
  catalog: string[];
  now?: Date;
}

export function resolveEffectivePermissions(input: ResolveInput): EffectivePermissions {
  const now = input.now ?? new Date();
  const rolesById = new Map(input.roles.map((role) => [role.id, role]));
  const decisions = new Map<string, PermissionDecision>();

  const decisionFor = (code: string): PermissionDecision => {
    let decision = decisions.get(code);
    if (!decision) {
      decision = { permission: code, allowed: false, grants: [], denial: null };
      decisions.set(code, decision);
    }
    return decision;
  };

  const addRoleGrant = (code: string, reached: ReachedRole, wildcard: boolean) => {
    const decision = decisionFor(code);
    const alreadyGranted = decision.grants.some(
      (grant) => grant.type === 'ROLE' && grant.roleCode === reached.node.code,
    );
    if (alreadyGranted) return;
    decision.grants.push({
      type: 'ROLE',
      roleCode: reached.node.code,
      roleName: reached.node.name,
      via: reached.path,
      wildcard,
    });
  };

  for (const assignment of input.assignments) {
    if (!isActive(assignment.expiresAt, now)) continue;
    for (const reached of walkRoleAncestors(assignment.roleId, rolesById)) {
      for (const code of reached.node.permissionCodes) {
        if (code === WILDCARD) {
          for (const catalogCode of new Set([WILDCARD, ...input.catalog])) {
            addRoleGrant(catalogCode, reached, true);
          }
        } else {
          addRoleGrant(code, reached, false);
        }
      }
    }
  }

  for (const privilege of input.privileges) {
    if (!isActive(privilege.expiresAt, now)) continue;
    const decision = decisionFor(privilege.permissionCode);
    if (privilege.effect === 'ALLOW') {
      decision.grants.push({
        type: 'PRIVILEGE',
        privilegeId: privilege.id,
        reason: privilege.reason,
        expiresAt: privilege.expiresAt,
      });
    } else {
      decision.denial = {
        privilegeId: privilege.id,
        reason: privilege.reason,
        expiresAt: privilege.expiresAt,
      };
    }
  }

  for (const decision of decisions.values()) {
    decision.allowed = decision.grants.length > 0 && decision.denial === null;
  }

  return new EffectivePermissions(decisions);
}

export interface RolePermissionEntry {
  permission: string;
  /** False when the role holds the permission itself, true when it comes from an ancestor. */
  inherited: boolean;
  /** Role that directly holds the permission (first one found). */
  fromRoleCode: string;
}

/** Permissions held by a role, including inherited ones and "*" expansion. */
export function resolveRolePermissions(
  roleId: string,
  roles: RoleGraphNode[],
  catalog: string[],
): RolePermissionEntry[] {
  const rolesById = new Map(roles.map((role) => [role.id, role]));
  const entries = new Map<string, RolePermissionEntry>();
  for (const reached of walkRoleAncestors(roleId, rolesById)) {
    const inherited = reached.node.id !== roleId;
    for (const code of reached.node.permissionCodes) {
      const codes = code === WILDCARD ? [WILDCARD, ...catalog] : [code];
      for (const permission of codes) {
        if (!entries.has(permission)) {
          entries.set(permission, { permission, inherited, fromRoleCode: reached.node.code });
        }
      }
    }
  }
  return [...entries.values()].sort((a, b) => a.permission.localeCompare(b.permission));
}
