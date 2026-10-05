import { ROLE } from '../authorization/catalog';

export interface DemoAccount {
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  /** Short French description shown on the login page. */
  description: string;
}

/** Demo accounts created by the seed. They all share DEMO_PASSWORD. */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: 'superadmin@aqualab.test',
    firstName: 'Nadia',
    lastName: 'Benali',
    roles: [ROLE.SUPER_ADMIN],
    description: 'Accès total (permission *)',
  },
  {
    email: 'admin@aqualab.test',
    firstName: 'Sophie',
    lastName: 'Bernard',
    roles: [ROLE.ADMIN],
    description: 'Gère les comptes et les rôles, aucun droit sur le laboratoire',
  },
  {
    email: 'resp.labo@aqualab.test',
    firstName: 'Karim',
    lastName: 'Haddad',
    roles: [ROLE.LAB_MANAGER],
    description: 'Valide les résultats et habilite le personnel du labo',
  },
  {
    email: 'qualite@aqualab.test',
    firstName: 'Claire',
    lastName: 'Dubois',
    roles: [ROLE.QUALITY_MANAGER],
    description: "Gère les paramètres, seuils et points ; lit l'audit",
  },
  {
    email: 'analyste1@aqualab.test',
    firstName: 'Julien',
    lastName: 'Moreau',
    roles: [ROLE.ANALYST],
    description: 'Analyste, intérim de validation (privilège ALLOW temporaire)',
  },
  {
    email: 'analyste2@aqualab.test',
    firstName: 'Aïcha',
    lastName: 'Diallo',
    roles: [ROLE.ANALYST],
    description: 'Analyste',
  },
  {
    email: 'technicien1@aqualab.test',
    firstName: 'Thomas',
    lastName: 'Petit',
    roles: [ROLE.TECHNICIAN],
    description: 'Technicien préleveur',
  },
  {
    email: 'technicien2@aqualab.test',
    firstName: 'Marc',
    lastName: 'Lefèvre',
    roles: [ROLE.TECHNICIAN],
    description: 'Technicien, habilitation suspendue (privilège DENY)',
  },
  {
    email: 'consultant@aqualab.test',
    firstName: 'Léa',
    lastName: 'Fontaine',
    roles: [ROLE.VIEWER],
    description: 'Consultant : lecture seule, résultats validés uniquement',
  },
];
