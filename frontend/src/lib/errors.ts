import { ApiError } from './api';

const MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'Les données envoyées sont invalides.',
  NOT_FOUND: 'Élément introuvable.',
  CONFLICT: 'Conflit avec des données existantes.',
  INTERNAL_ERROR: 'Erreur interne du serveur.',
  TOO_MANY_REQUESTS: 'Trop de tentatives, réessayez dans une minute.',
  UNAUTHENTICATED: 'Session expirée, veuillez vous reconnecter.',
  INVALID_CREDENTIALS: 'E-mail ou mot de passe incorrect.',
  ACCOUNT_LOCKED: 'Compte temporairement verrouillé après trop de tentatives.',
  ACCOUNT_DISABLED: 'Ce compte est désactivé.',
  INVALID_REFRESH_TOKEN: 'Session expirée, veuillez vous reconnecter.',
  WEAK_PASSWORD: 'Mot de passe trop faible : 8 caractères minimum, avec une minuscule, une majuscule et un chiffre.',
  INVALID_CURRENT_PASSWORD: 'Le mot de passe actuel est incorrect.',
  FORBIDDEN: 'Accès refusé : permission manquante.',
  PRIVILEGE_ESCALATION: 'Refusé (anti-escalade) : vous ne pouvez pas accorder ou retirer des permissions que vous ne possédez pas.',
  SELF_MODIFICATION_FORBIDDEN: 'Vous ne pouvez pas modifier vos propres droits, statut ou compte.',
  SUPER_ADMIN_PROTECTED: 'Seul un super-administrateur peut gérer un super-administrateur.',
  EMAIL_ALREADY_USED: 'Cet e-mail est déjà utilisé.',
  ROLE_CODE_ALREADY_USED: 'Ce code de rôle est déjà utilisé.',
  ROLE_CYCLE: "Cet héritage créerait un cycle entre les rôles.",
  ROLE_IN_USE: 'Ce rôle est encore attribué à des utilisateurs ou hérité par d’autres rôles.',
  SYSTEM_ROLE_PROTECTED: 'Ce rôle système est protégé.',
  UNKNOWN_PERMISSION: 'Permission inconnue.',
  WILDCARD_PRIVILEGE_FORBIDDEN: 'La permission « * » ne peut être accordée que par un rôle.',
  NOT_OWNER: 'Vous ne pouvez modifier que les échantillons que vous avez prélevés.',
  INVALID_SAMPLE_STATUS: "Action impossible dans le statut actuel de l'échantillon.",
  SAMPLE_LOCKED: 'Échantillon verrouillé : il ne peut plus être modifié ni supprimé.',
  RESULTS_INCOMPLETE: 'Tous les résultats doivent être saisis avant de soumettre.',
  UNKNOWN_SAMPLE_PARAMETER: "Ce paramètre n'est pas demandé pour cet échantillon.",
  FOUR_EYES_VIOLATION: 'Principe des 4 yeux : vous ne pouvez pas valider des résultats que vous avez saisis.',
  CODE_ALREADY_USED: 'Ce code est déjà utilisé.',
  IN_USE: 'Élément encore utilisé : désactivez-le plutôt que de le supprimer.',
  INACTIVE_REFERENCE: 'Référence inactive (point ou paramètre désactivé).',
};

function detailsSuffix(error: ApiError): string {
  const details = error.details as Record<string, unknown> | undefined;
  if (!details || typeof details !== 'object') return '';
  const missing = (details as { missing?: string[] }).missing;
  if (Array.isArray(missing) && missing.length > 0) return ` Manquant : ${missing.join(', ')}.`;
  const unknown = (details as { missing?: string[]; inactive?: string[] }).inactive;
  if (Array.isArray(unknown) && unknown.length > 0) return ` (${unknown.join(', ')})`;
  return '';
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const base = MESSAGES[error.code] ?? error.message;
    if (error.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
      const fields = (error.details as { field: string; errors: string[] }[])
        .map((detail) => `${detail.field} : ${detail.errors.join(', ')}`)
        .join(' ; ');
      return `${base} ${fields}`;
    }
    return `${base}${detailsSuffix(error)}`;
  }
  return error instanceof Error ? error.message : 'Erreur inattendue.';
}

export function errorCode(error: unknown): string | null {
  return error instanceof ApiError ? error.code : null;
}
