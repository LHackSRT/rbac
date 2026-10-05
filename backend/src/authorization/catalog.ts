/**
 * Permission catalog and built-in roles.
 *
 * A permission code is "resource:action" where the action may carry a scope
 * suffix (":own" / ":any"). "*" is the wildcard held by the super administrator.
 * Descriptions and role names are user-facing, hence written in French.
 */

export const WILDCARD = '*';

export const P = {
  ALL: WILDCARD,

  SAMPLING_POINT_READ: 'sampling-point:read',
  SAMPLING_POINT_MANAGE: 'sampling-point:manage',
  PARAMETER_READ: 'parameter:read',
  PARAMETER_MANAGE: 'parameter:manage',
  SAMPLE_READ: 'sample:read',
  SAMPLE_CREATE: 'sample:create',
  SAMPLE_UPDATE_OWN: 'sample:update:own',
  SAMPLE_UPDATE_ANY: 'sample:update:any',
  SAMPLE_DELETE: 'sample:delete',
  RESULT_READ: 'result:read',
  RESULT_ENTER: 'result:enter',
  RESULT_VALIDATE: 'result:validate',
  REPORT_EXPORT: 'report:export',

  USER_READ: 'user:read',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  USER_ASSIGN_ROLE: 'user:assign-role',
  USER_MANAGE_PRIVILEGES: 'user:manage-privileges',
  ROLE_READ: 'role:read',
  ROLE_MANAGE: 'role:manage',
  PERMISSION_READ: 'permission:read',
  AUDIT_READ: 'audit:read',
} as const;

export type PermissionCode = (typeof P)[keyof typeof P];

export interface PermissionDefinition {
  code: PermissionCode;
  description: string;
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  { code: P.ALL, description: 'Toutes les permissions (super-administrateur)' },

  { code: P.SAMPLING_POINT_READ, description: 'Consulter les points de prélèvement' },
  { code: P.SAMPLING_POINT_MANAGE, description: 'Gérer les points de prélèvement' },
  { code: P.PARAMETER_READ, description: 'Consulter les paramètres et leurs seuils' },
  { code: P.PARAMETER_MANAGE, description: 'Gérer les paramètres et leurs seuils' },
  { code: P.SAMPLE_READ, description: 'Consulter les échantillons' },
  { code: P.SAMPLE_CREATE, description: 'Enregistrer un échantillon' },
  { code: P.SAMPLE_UPDATE_OWN, description: 'Modifier ses propres échantillons' },
  { code: P.SAMPLE_UPDATE_ANY, description: 'Modifier tous les échantillons' },
  { code: P.SAMPLE_DELETE, description: 'Supprimer un échantillon non validé' },
  { code: P.RESULT_READ, description: 'Consulter les résultats validés' },
  { code: P.RESULT_ENTER, description: "Saisir les résultats d'analyse" },
  { code: P.RESULT_VALIDATE, description: 'Valider ou rejeter les résultats' },
  { code: P.REPORT_EXPORT, description: 'Exporter les rapports de résultats' },

  { code: P.USER_READ, description: 'Consulter les utilisateurs' },
  { code: P.USER_CREATE, description: 'Créer un utilisateur' },
  { code: P.USER_UPDATE, description: 'Modifier un utilisateur (profil, statut, mot de passe)' },
  { code: P.USER_DELETE, description: 'Supprimer un utilisateur' },
  { code: P.USER_ASSIGN_ROLE, description: 'Attribuer ou retirer des rôles' },
  { code: P.USER_MANAGE_PRIVILEGES, description: 'Gérer les privilèges individuels (ALLOW / DENY)' },
  { code: P.ROLE_READ, description: 'Consulter les rôles' },
  { code: P.ROLE_MANAGE, description: 'Gérer les rôles (création, permissions, héritage)' },
  { code: P.PERMISSION_READ, description: 'Consulter le catalogue des permissions' },
  { code: P.AUDIT_READ, description: "Consulter le journal d'audit" },
];

export function splitPermissionCode(code: string): { resource: string; action: string } {
  if (code === WILDCARD) return { resource: WILDCARD, action: WILDCARD };
  const index = code.indexOf(':');
  return { resource: code.slice(0, index), action: code.slice(index + 1) };
}

export const ROLE = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  VIEWER: 'VIEWER',
  TECHNICIAN: 'TECHNICIAN',
  ANALYST: 'ANALYST',
  LAB_MANAGER: 'LAB_MANAGER',
  QUALITY_MANAGER: 'QUALITY_MANAGER',
} as const;

export interface RoleDefinition {
  code: string;
  name: string;
  description: string;
  parents: string[];
  permissions: PermissionCode[];
}

/**
 * Built-in roles. Each role only lists its *own* permissions: inherited ones
 * come from its parents.
 *
 *   VIEWER
 *    ├── TECHNICIAN
 *    │    └── ANALYST
 *    │         └── LAB_MANAGER
 *    └── QUALITY_MANAGER
 *   ADMIN          (accounts and roles only, no laboratory permission)
 *   SUPER_ADMIN    (*)
 */
export const SYSTEM_ROLES: RoleDefinition[] = [
  {
    code: ROLE.SUPER_ADMIN,
    name: 'Super-administrateur',
    description: 'Accès total à toutes les fonctionnalités.',
    parents: [],
    permissions: [P.ALL],
  },
  {
    code: ROLE.ADMIN,
    name: 'Administrateur',
    description:
      "Gère les comptes utilisateurs et les rôles. N'a aucun droit sur les données du laboratoire.",
    parents: [],
    permissions: [
      P.USER_READ,
      P.USER_CREATE,
      P.USER_UPDATE,
      P.USER_DELETE,
      P.USER_ASSIGN_ROLE,
      P.USER_MANAGE_PRIVILEGES,
      P.ROLE_READ,
      P.ROLE_MANAGE,
      P.PERMISSION_READ,
      P.AUDIT_READ,
    ],
  },
  {
    code: ROLE.VIEWER,
    name: 'Consultant',
    description:
      'Consulte les points de prélèvement, les paramètres, les échantillons et les résultats validés.',
    parents: [],
    permissions: [P.SAMPLING_POINT_READ, P.PARAMETER_READ, P.SAMPLE_READ, P.RESULT_READ],
  },
  {
    code: ROLE.TECHNICIAN,
    name: 'Technicien préleveur',
    description: 'Enregistre les échantillons prélevés et modifie les siens.',
    parents: [ROLE.VIEWER],
    permissions: [P.SAMPLE_CREATE, P.SAMPLE_UPDATE_OWN],
  },
  {
    code: ROLE.ANALYST,
    name: 'Analyste',
    description: "Saisit les résultats d'analyse.",
    parents: [ROLE.TECHNICIAN],
    permissions: [P.RESULT_ENTER],
  },
  {
    code: ROLE.LAB_MANAGER,
    name: 'Responsable laboratoire',
    description:
      'Valide les résultats, gère tous les échantillons et habilite le personnel du laboratoire.',
    parents: [ROLE.ANALYST],
    permissions: [
      P.RESULT_VALIDATE,
      P.SAMPLE_UPDATE_ANY,
      P.SAMPLE_DELETE,
      P.REPORT_EXPORT,
      P.USER_READ,
      P.USER_ASSIGN_ROLE,
      P.USER_MANAGE_PRIVILEGES,
      P.ROLE_READ,
      P.PERMISSION_READ,
    ],
  },
  {
    code: ROLE.QUALITY_MANAGER,
    name: 'Responsable qualité',
    description:
      "Gère les paramètres, leurs seuils et les points de prélèvement. Consulte le journal d'audit.",
    parents: [ROLE.VIEWER],
    permissions: [P.PARAMETER_MANAGE, P.SAMPLING_POINT_MANAGE, P.REPORT_EXPORT, P.AUDIT_READ],
  },
];
