import type { Role } from './types';

/** Anti-escalation rule mirrored from the API: a role can be handled only if you hold all its permissions. */
export function missingPermissionsFor(role: Role, can: (permission: string) => boolean): string[] {
  return role.effectivePermissions.map((entry) => entry.permission).filter((permission) => !can(permission));
}

/**
 * Orders roles following the hierarchy: each root (largest tree first) is
 * followed by its descendants, depth-first.
 */
export function orderByHierarchy(roles: Role[]): Role[] {
  const byId = new Map(roles.map((role) => [role.id, role]));
  const descendants = (role: Role, seen = new Set<string>()): number =>
    role.children.reduce((count, child) => {
      if (seen.has(child.id)) return count;
      seen.add(child.id);
      const node = byId.get(child.id);
      return count + 1 + (node ? descendants(node, seen) : 0);
    }, 0);
  const roots = roles
    .filter((role) => role.parents.length === 0)
    .sort((a, b) => descendants(b) - descendants(a) || a.code.localeCompare(b.code));
  const ordered: Role[] = [];
  const visit = (role: Role) => {
    if (ordered.includes(role)) return;
    ordered.push(role);
    [...role.children]
      .sort((a, b) => a.code.localeCompare(b.code))
      .forEach((child) => {
        const node = byId.get(child.id);
        if (node) visit(node);
      });
  };
  roots.forEach(visit);
  roles.forEach(visit);
  return ordered;
}
