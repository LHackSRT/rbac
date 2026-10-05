import type { CheckOutcome, ParameterCategory, SampleStatus, SamplingPointType, UserStatus } from './types';

export const SAMPLE_STATUS_LABEL: Record<SampleStatus, string> = {
  REGISTERED: 'Enregistré',
  ANALYZED: 'Analysé',
  VALIDATED: 'Validé',
};

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: 'Actif',
  DISABLED: 'Désactivé',
  LOCKED: 'Verrouillé',
};

export const SAMPLING_POINT_TYPE_LABEL: Record<SamplingPointType, string> = {
  GROUNDWATER: 'Eau souterraine',
  SURFACE_WATER: 'Eau de surface',
  TREATMENT_PLANT: 'Station de traitement',
  RESERVOIR: 'Réservoir',
  DISTRIBUTION_NETWORK: 'Réseau de distribution',
};

export const PARAMETER_CATEGORY_LABEL: Record<ParameterCategory, string> = {
  PHYSICOCHEMICAL: 'Physico-chimique',
  MICROBIOLOGICAL: 'Microbiologique',
};

export const RESOURCE_LABEL: Record<string, string> = {
  '*': 'Tout',
  'sampling-point': 'Points de prélèvement',
  parameter: 'Paramètres et seuils',
  sample: 'Échantillons',
  result: 'Résultats',
  report: 'Rapports',
  user: 'Utilisateurs',
  role: 'Rôles',
  permission: 'Permissions',
  audit: 'Audit',
};

export function resourceOf(code: string) {
  return code === '*' ? '*' : code.slice(0, code.indexOf(':'));
}

export const CHECK_OUTCOME_LABEL: Record<CheckOutcome, string> = {
  GRANTED: 'Autorisé',
  DENIED_BY_PRIVILEGE: 'Refusé par un privilège DENY',
  NOT_GRANTED: "Aucun rôle ni privilège n'accorde cette permission",
  USER_DISABLED: 'Compte désactivé : aucune permission',
  UNKNOWN_PERMISSION: 'Permission inconnue du catalogue',
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  AUTH_LOGIN_SUCCEEDED: 'Connexion réussie',
  AUTH_LOGIN_FAILED: 'Échec de connexion',
  AUTH_ACCOUNT_LOCKED: 'Compte verrouillé',
  AUTH_LOGOUT: 'Déconnexion',
  AUTH_PASSWORD_CHANGED: 'Mot de passe modifié',
  AUTH_REFRESH_TOKEN_REUSED: 'Réutilisation de jeton détectée',
  ACCESS_DENIED: 'Accès refusé',
  USER_CREATED: 'Utilisateur créé',
  USER_UPDATED: 'Utilisateur modifié',
  USER_STATUS_CHANGED: 'Statut modifié',
  USER_UNLOCKED: 'Compte déverrouillé',
  USER_PASSWORD_RESET: 'Mot de passe réinitialisé',
  USER_DELETED: 'Utilisateur supprimé',
  USER_ROLES_CHANGED: 'Rôles modifiés',
  USER_PRIVILEGE_GRANTED: 'Privilège accordé',
  USER_PRIVILEGE_REVOKED: 'Privilège retiré',
  ROLE_CREATED: 'Rôle créé',
  ROLE_UPDATED: 'Rôle modifié',
  ROLE_PERMISSIONS_CHANGED: 'Permissions du rôle modifiées',
  ROLE_PARENTS_CHANGED: 'Héritage du rôle modifié',
  ROLE_DELETED: 'Rôle supprimé',
  SAMPLING_POINT_CREATED: 'Point de prélèvement créé',
  SAMPLING_POINT_UPDATED: 'Point de prélèvement modifié',
  SAMPLING_POINT_DELETED: 'Point de prélèvement supprimé',
  PARAMETER_CREATED: 'Paramètre créé',
  PARAMETER_UPDATED: 'Paramètre modifié',
  PARAMETER_DELETED: 'Paramètre supprimé',
  SAMPLE_CREATED: 'Échantillon enregistré',
  SAMPLE_UPDATED: 'Échantillon modifié',
  SAMPLE_DELETED: 'Échantillon supprimé',
  RESULTS_ENTERED: 'Résultats saisis',
  SAMPLE_SUBMITTED: 'Analyse soumise',
  SAMPLE_VALIDATED: 'Résultats validés',
  SAMPLE_REJECTED: 'Résultats rejetés',
  REPORT_EXPORTED: 'Rapport exporté',
};
