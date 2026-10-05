# AquaLab : gestion des utilisateurs et RBAC

Démonstrateur complet de **gestion des utilisateurs et de contrôle d'accès basé sur les rôles (RBAC)**, appliqué à un
**laboratoire d'analyses biochimiques de l'eau**. Il comprend une API sécurisée et une application web en français pour
tester chaque mécanisme : rôles hiérarchiques, permissions, privilèges individuels, séparation des tâches, anti-escalade
et audit.

| Couche | Technologies |
|---|---|
| API | NestJS 11, TypeScript, Prisma 6, PostgreSQL 16, JWT, argon2 |
| Front | React 19, Vite, TanStack Query, React Router, Tailwind CSS 4 |
| Tests | Jest (moteur RBAC), Supertest (tests de bout en bout de l'API) |

Le code est en anglais, l'interface en français.

---

## Démarrage rapide (Docker)

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Application web | http://localhost:8080 |
| API | http://localhost:3000/api |
| Documentation OpenAPI (Swagger) | http://localhost:3000/api/docs |

Au premier démarrage, l'API applique les migrations, puis crée le catalogue de permissions, les rôles, les comptes de
démonstration et les données du laboratoire.

## Développement local

Prérequis : Node.js 22 et PostgreSQL 16. Vous pouvez lancer seulement la base avec `docker compose up db`.

```bash
# API
cd backend
cp .env.example .env          # adapter DATABASE_URL si besoin
npm install
npx prisma migrate dev        # crée le schéma puis lance le seed
npm run start:dev             # http://localhost:3000/api

# Front (dans un autre terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173 (proxy /api → :3000)
```

Pour réinitialiser les données de démonstration : `npx ts-node --transpile-only prisma/seed.ts --reset`.

## Comptes de démonstration

Mot de passe commun : **`Demo1234!`**. La page de connexion permet de se connecter en un clic, et le menu du compte
permet de changer d'utilisateur à tout moment.

| Compte | Rôle | Particularité |
|---|---|---|
| superadmin@aqualab.test | SUPER_ADMIN | Permission `*` |
| admin@aqualab.test | ADMIN | Gère les comptes et les rôles, **aucun droit labo** |
| resp.labo@aqualab.test | LAB_MANAGER | Valide les résultats, habilite le personnel du labo |
| qualite@aqualab.test | QUALITY_MANAGER | Paramètres, seuils, points de prélèvement, audit |
| analyste1@aqualab.test | ANALYST | **Privilège ALLOW temporaire** `result:validate` (intérim, 7 jours) |
| analyste2@aqualab.test | ANALYST | — |
| technicien1@aqualab.test | TECHNICIAN | — |
| technicien2@aqualab.test | TECHNICIAN | **Privilège DENY** `sample:create` (habilitation suspendue) |
| consultant@aqualab.test | VIEWER | Lecture seule, résultats validés uniquement |

---

## Domaine métier

Le laboratoire manipule quatre objets métier :

- **Points de prélèvement** : forage, station de traitement, réservoir, réseau, rivière.
- **Paramètres** : pH, turbidité, conductivité, nitrates, chlore libre, *E. coli*, entérocoques, coliformes. Chacun a
  une unité et des seuils de conformité (bornes incluses).
- **Échantillons** : eau prélevée à un point, à une date, avec la liste des paramètres à analyser.
- **Résultats** : une valeur par paramètre. La conformité est calculée automatiquement à partir des seuils.

```
REGISTERED ──saisie + soumission──▶ ANALYZED ──validation──▶ VALIDATED (verrouillé)
(Enregistré)                        (Analysé)  │             (Validé)
     ▲                                         │
     └───────────rejet (avec motif)────────────┘
```

---

## Modèle RBAC

### Concepts

| Concept | Description |
|---|---|
| **Permission** | Droit atomique `ressource:action`, avec une portée facultative (`sample:update:own`, `sample:update:any`). `*` = toutes les permissions. |
| **Rôle** | Ensemble de permissions. Un rôle **hérite** d'un ou plusieurs rôles parents (les cycles sont refusés). |
| **Attribution de rôle** | Lien utilisateur → rôle, avec une **date d'expiration** facultative (rôle temporaire). |
| **Privilège** | Exception individuelle sur un utilisateur : **ALLOW** (ajoute une permission) ou **DENY** (la retire), avec un motif et une expiration facultative. |

### Calcul des permissions effectives

```
permissions(utilisateur) =
      ∪ permissions des rôles actifs et de tous leurs ancêtres   ("*" = tout le catalogue)
    + privilèges ALLOW actifs
    − privilèges DENY actifs                                     (un DENY l'emporte toujours)
```

- Le calcul est fait par un moteur pur et testé : `backend/src/authorization/permission-resolver.ts`.
- Les permissions sont **recalculées à chaque requête** et ne sont pas stockées dans le JWT. Retirer un rôle, ajouter un
  DENY ou désactiver un compte prend donc effet **immédiatement**.
- Chaque décision est **expliquée** : par exemple « accordé via LAB_MANAGER → ANALYST → TECHNICIAN → VIEWER » ou
  « refusé par un DENY (motif, expiration) ». Cette explication est visible dans le testeur d'accès et dans
  « Mes droits ».

### Rôles intégrés

```
VIEWER (Consultant)                      sampling-point:read, parameter:read, sample:read, result:read
 ├── TECHNICIAN (Technicien préleveur)   + sample:create, sample:update:own
 │    └── ANALYST (Analyste)             + result:enter
 │         └── LAB_MANAGER (Resp. labo)  + result:validate, sample:update:any, sample:delete, report:export,
 │                                         user:read, user:assign-role, user:manage-privileges, role:read, permission:read
 └── QUALITY_MANAGER (Resp. qualité)     + parameter:manage, sampling-point:manage, report:export, audit:read

ADMIN                                    user:*, role:read, role:manage, permission:read, audit:read (aucun droit labo)
SUPER_ADMIN                              *
```

### Règles de sécurité

| Règle | Effet |
|---|---|
| **Anti-escalade** | On ne peut accorder, retirer ou déléguer **que des permissions qu'on possède**. Cela vaut pour les privilèges, les rôles attribués (toutes leurs permissions, héritées comprises) et l'édition des permissions ou de l'héritage d'un rôle. |
| **Administration ≠ métier** | L'ADMIN crée les comptes, mais ne peut pas habiliter un analyste (il n'a pas les permissions du labo). C'est le **responsable labo** qui habilite son personnel. |
| **Pas d'auto-modification** | Personne ne peut modifier ses propres rôles, privilèges ou statut, ni supprimer son propre compte. |
| **Protection du super-admin** | Seul un SUPER_ADMIN peut gérer un SUPER_ADMIN. Le rôle SUPER_ADMIN est immuable et les rôles système ne peuvent pas être supprimés. |
| **Principe des 4 yeux** (ISO/IEC 17025) | Personne ne peut valider des résultats qu'il a saisis ou soumis, quelles que soient ses permissions. |
| **Visibilité des résultats** | Avec seulement `result:read`, on ne voit que les résultats **validés**. Les valeurs sont masquées par l'API, pas seulement par l'interface. |
| **Traçabilité** | Un échantillon validé est verrouillé : il ne peut plus être modifié ni supprimé. |

### Authentification et comptes

- **Access token** JWT de 15 minutes, gardé en mémoire côté front.
- **Refresh token** opaque dans un cookie `httpOnly`. Il est haché en base et **change à chaque utilisation**. La
  réutilisation d'un ancien jeton révoque toutes les sessions de l'utilisateur.
- Mots de passe hachés en **argon2id**, avec une politique : 8 caractères minimum, une minuscule, une majuscule et un chiffre.
- **Verrouillage** du compte pendant 15 minutes après 5 échecs de connexion. Un administrateur peut le déverrouiller.
- **Limitation du débit** sur la route de connexion.
- La désactivation d'un compte ou la réinitialisation de son mot de passe **révoquent immédiatement** toutes ses sessions.

### Journal d'audit

Le journal trace :

- les connexions, les échecs de connexion et les verrouillages ;
- les changements de rôles, de privilèges et d'héritage ;
- toutes les actions du laboratoire ;
- **chaque accès refusé (403)**, avec la route et le code d'erreur.

---

## Guide de test pas à pas

Le bouton **Mode debug** (en haut à droite) affiche, encadrés en rouge, les boutons et pages normalement masqués faute de
permission. Il sert à vérifier que **l'API refuse vraiment** l'action (403), et pas seulement l'interface.

| # | Scénario | Comment | Résultat attendu |
|---|---|---|---|
| 1 | Permission manquante | Consultant → Échantillons → mode debug → « Nouvel échantillon » | 403 « Manquant : sample:create », visible dans l'audit |
| 2 | Héritage | Analyste 2 → Nouvel échantillon | Autorisé (`sample:create` hérité de TECHNICIAN) |
| 3 | Branches sœurs | Resp. qualité → Échantillons | Pas de bouton de création (pas de droit hérité de TECHNICIAN) |
| 4 | Portée `own` / `any` | Technicien 2 ouvre un échantillon de Technicien 1 → mode debug → Modifier | 403 `NOT_OWNER`. Le responsable labo, lui, peut modifier |
| 5 | Circuit complet | Technicien 1 enregistre → Analyste 2 saisit et soumet → Resp. labo valide | Statut « Validé », non-conformités signalées |
| 6 | 4 yeux | Resp. labo → À valider → l'échantillon RES-MAIRIE qu'il a analysé lui-même : le bouton « Valider » est masqué ; mode debug → Valider | Refusé `FOUR_EYES_VIOLATION`. Analyste 1 (intérim) peut le valider |
| 7 | ALLOW temporaire | Testeur d'accès → Julien + `result:validate` | Accordé par privilège, avec sa date d'expiration |
| 8 | DENY prioritaire | Testeur d'accès → Marc + `sample:create` | Refusé par DENY alors que TECHNICIAN l'accorde |
| 9 | Anti-escalade | Admin → Utilisateurs → Thomas → Rôles → mode debug → cocher ANALYST | 403 `PRIVILEGE_ESCALATION` avec la liste des permissions manquantes |
| 10 | Habilitation déléguée | Resp. labo → Utilisateurs → Thomas → cocher ANALYST (avec une expiration) | Autorisé. Thomas peut saisir des résultats sans se reconnecter |
| 11 | Auto-modification | Resp. labo → sa propre fiche → Rôles → cocher VIEWER → Enregistrer | 403 `SELF_MODIFICATION_FORBIDDEN` |
| 12 | Super-admin protégé | Admin → fiche Super-admin → Compte → Désactiver | 403 `SUPER_ADMIN_PROTECTED` |
| 13 | Révocation immédiate | Dans deux navigateurs : le super-admin retire le rôle du technicien connecté | La requête suivante du technicien est refusée |
| 14 | Cycle d'héritage | Super-admin → Rôles → VIEWER → Hérite de LAB_MANAGER | Refusé `ROLE_CYCLE` |
| 15 | Verrouillage | 5 mauvais mots de passe sur un compte | `ACCOUNT_LOCKED` ; « Déverrouiller » depuis la fiche utilisateur |
| 16 | Visibilité | Consultant → un échantillon non validé | Résultats masqués par l'API |
| 17 | Export | Consultant → Rapports | Pas de bouton d'export (`report:export`) ; le responsable qualité peut exporter |

---

## API

Préfixe `/api`. La documentation interactive est sur `/api/docs`. Chaque erreur suit le format
`{ statusCode, code, message, details }`.

| Domaine | Routes |
|---|---|
| Auth | `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/change-password` · `GET /auth/demo-accounts` |
| Utilisateurs | `GET/POST /users` · `GET/PATCH/DELETE /users/:id` · `PATCH /users/:id/status` · `POST /users/:id/unlock` · `POST /users/:id/reset-password` · `PUT /users/:id/roles` · `POST /users/:id/privileges` · `DELETE /users/:id/privileges/:privilegeId` |
| Rôles | `GET/POST /roles` · `GET/PATCH/DELETE /roles/:id` · `PUT /roles/:id/permissions` · `PUT /roles/:id/parents` |
| Permissions | `GET /permissions` (catalogue) |
| Autorisation | `POST /authz/check` (testeur d'accès avec explication) |
| Audit | `GET /audit-logs` · `GET /audit-logs/actions` |
| Laboratoire | `GET/POST/PATCH/DELETE /sampling-points` · `/parameters` · `GET/POST /samples` · `GET/PATCH/DELETE /samples/:id` · `PUT /samples/:id/results` · `POST /samples/:id/submit` · `POST /samples/:id/validate` · `POST /samples/:id/reject` |
| Rapports | `GET /dashboard` · `GET /reports/results` · `GET /reports/results/export` (CSV) |

Une route se protège par décorateur :

```ts
@Patch(':id')
@RequireAnyPermission(P.SAMPLE_UPDATE_OWN, P.SAMPLE_UPDATE_ANY)
update(@Auth() auth: AuthContext, @Param('id') id: string, @Body() dto: UpdateSampleDto) { … }
```

## Tests

```bash
cd backend
npm test             # tests unitaires du moteur RBAC
npm run test:e2e     # tests de bout en bout de l'API (base PostgreSQL rbac_test)
```

Les tests e2e utilisent `TEST_DATABASE_URL`, par défaut
`postgresql://rbac:rbac@localhost:5432/rbac_test`. Ils appliquent les migrations puis ré-initialisent les données avant
chaque suite.

## Structure

```
backend/
  prisma/                   schéma, migrations, seed (catalogue, rôles, données de démo)
  src/authorization/        catalogue, moteur RBAC, guard global, décorateurs, testeur d'accès
  src/auth/                 connexion, jetons, mots de passe
  src/users/  src/roles/    administration des utilisateurs, rôles et privilèges
  src/audit/                journal d'audit
  src/lab/                  domaine laboratoire (points, paramètres, échantillons, rapports)
  test/                     tests e2e
frontend/
  src/auth/                 session, mode debug, composant <Can>
  src/pages/lab/            pages du laboratoire
  src/pages/admin/          utilisateurs, rôles, matrice, testeur d'accès, audit
docker-compose.yml          PostgreSQL + API + front (nginx)
```

## Mise en production

- Définir un `JWT_ACCESS_SECRET` long et aléatoire.
- Passer `COOKIE_SECURE=true` (HTTPS obligatoire).
- Passer `DEMO_MODE=false` : la liste des comptes de démonstration n'est alors plus exposée.
- Ne pas lancer le seed avec `--reset`.
- Remplacer les mots de passe de démonstration.
