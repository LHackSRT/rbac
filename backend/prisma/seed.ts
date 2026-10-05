import 'dotenv/config';
import { PrismaClient, SampleStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSION_CATALOG, ROLE, SYSTEM_ROLES, splitPermissionCode } from '../src/authorization/catalog';
import { DEMO_PASSWORD } from '../src/config';
import { DEMO_ACCOUNTS } from '../src/demo/demo-accounts';

/**
 * Seeds the permission catalog, the built-in roles and, on an empty database
 * (or with --reset), the demo accounts and laboratory data.
 */

const DAY = 24 * 3600 * 1000;

/** Creates or updates every catalog permission. */
async function syncCatalog(prisma: PrismaClient) {
  for (const permission of PERMISSION_CATALOG) {
    const { resource, action } = splitPermissionCode(permission.code);
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: { code: permission.code, resource, action, description: permission.description },
      update: { resource, action, description: permission.description },
    });
  }
}

/** Creates the missing built-in roles. Existing roles are left untouched (they may have been edited). */
async function syncSystemRoles(prisma: PrismaClient) {
  const permissions = await prisma.permission.findMany();
  const permissionId = (code: string) => permissions.find((permission) => permission.code === code)!.id;

  for (const definition of SYSTEM_ROLES) {
    const existing = await prisma.role.findUnique({ where: { code: definition.code } });
    if (existing) continue;
    await prisma.role.create({
      data: {
        code: definition.code,
        name: definition.name,
        description: definition.description,
        isSystem: true,
        permissions: { create: definition.permissions.map((code) => ({ permissionId: permissionId(code) })) },
      },
    });
  }
  for (const definition of SYSTEM_ROLES) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: definition.code }, include: { parents: true } });
    if (role.parents.length > 0 || definition.parents.length === 0) continue;
    const parents = await prisma.role.findMany({ where: { code: { in: definition.parents } } });
    await prisma.roleParent.createMany({
      data: parents.map((parent) => ({ roleId: role.id, parentId: parent.id })),
      skipDuplicates: true,
    });
  }
}

async function resetDatabase(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE results, samples, parameters, sampling_points, audit_logs, refresh_tokens,
      user_privileges, user_roles, role_permissions, role_parents, roles, permissions, users RESTART IDENTITY CASCADE
  `);
}

async function seedDemoUsers(prisma: PrismaClient) {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const roles = await prisma.role.findMany();
  const users: Record<string, string> = {};
  for (const account of DEMO_ACCOUNTS) {
    const user = await prisma.user.create({
      data: {
        email: account.email,
        firstName: account.firstName,
        lastName: account.lastName,
        passwordHash,
        roles: {
          create: account.roles.map((code) => ({ roleId: roles.find((role) => role.code === code)!.id })),
        },
      },
    });
    users[account.email] = user.id;
  }
  return users;
}

async function seedLaboratory(prisma: PrismaClient, users: Record<string, string>) {
  const now = Date.now();
  const at = (daysAgo: number, hour = 8) => {
    const date = new Date(now - daysAgo * DAY);
    date.setHours(hour, 30, 0, 0);
    return date;
  };

  const points = {
    'FOR-01': { name: 'Forage F1 - captage nord', type: 'GROUNDWATER', location: 'Lieu-dit Les Sablons' },
    'STA-OUT': { name: 'Station de traitement - sortie', type: 'TREATMENT_PLANT', location: 'Usine de production' },
    'RES-NORD': { name: 'Réservoir Nord', type: 'RESERVOIR', location: 'Colline du Fort' },
    'RES-MAIRIE': { name: 'Réseau - robinet de la mairie', type: 'DISTRIBUTION_NETWORK', location: 'Place centrale' },
    'RIV-AMONT': { name: 'Rivière - amont du captage', type: 'SURFACE_WATER', location: 'Pont de la Vigne' },
  } as const;
  const pointIds: Record<string, string> = {};
  for (const [code, point] of Object.entries(points)) {
    pointIds[code] = (await prisma.samplingPoint.create({ data: { code, ...point } })).id;
  }

  // Indicative limits inspired by drinking water standards (editable in the application).
  const parameters = [
    { code: 'PH', name: 'pH', unit: 'unité pH', category: 'PHYSICOCHEMICAL', minValue: 6.5, maxValue: 8.5 },
    { code: 'TURB', name: 'Turbidité', unit: 'NTU', category: 'PHYSICOCHEMICAL', minValue: null, maxValue: 1 },
    { code: 'COND', name: 'Conductivité à 20 °C', unit: 'µS/cm', category: 'PHYSICOCHEMICAL', minValue: 200, maxValue: 1100 },
    { code: 'NO3', name: 'Nitrates', unit: 'mg/L', category: 'PHYSICOCHEMICAL', minValue: null, maxValue: 50 },
    { code: 'CL2', name: 'Chlore libre', unit: 'mg/L', category: 'PHYSICOCHEMICAL', minValue: 0.1, maxValue: 0.5 },
    { code: 'ECOLI', name: 'Escherichia coli', unit: 'UFC/100 mL', category: 'MICROBIOLOGICAL', minValue: null, maxValue: 0 },
    { code: 'ENTERO', name: 'Entérocoques intestinaux', unit: 'UFC/100 mL', category: 'MICROBIOLOGICAL', minValue: null, maxValue: 0 },
    { code: 'COLI', name: 'Bactéries coliformes', unit: 'UFC/100 mL', category: 'MICROBIOLOGICAL', minValue: null, maxValue: 0 },
  ] as const;
  const parameterIds: Record<string, string> = {};
  for (const parameter of parameters) {
    parameterIds[parameter.code] = (await prisma.parameter.create({ data: parameter })).id;
  }

  const PHYSCHEM = ['PH', 'TURB', 'COND', 'NO3', 'CL2'];
  const MICRO = ['ECOLI', 'ENTERO', 'COLI'];
  const FULL = [...PHYSCHEM, ...MICRO];
  const typical: Record<string, number> = { PH: 7.4, TURB: 0.3, COND: 520, NO3: 18, CL2: 0.25, ECOLI: 0, ENTERO: 0, COLI: 0 };

  const thomas = users['technicien1@aqualab.test'];
  const marc = users['technicien2@aqualab.test'];
  const julien = users['analyste1@aqualab.test'];
  const aicha = users['analyste2@aqualab.test'];
  const karim = users['resp.labo@aqualab.test'];

  interface SampleSpec {
    daysAgo: number;
    point: string;
    parameters: string[];
    collector: string;
    status: SampleStatus;
    analyst?: string;
    validator?: string;
    values?: Record<string, number>;
    /** Only these parameters get a value (partially analysed sample). */
    partial?: string[];
    rejectionReason?: string;
    notes?: string;
  }

  const specs: SampleSpec[] = [
    { daysAgo: 20, point: 'FOR-01', parameters: FULL, collector: thomas, status: 'VALIDATED', analyst: julien, validator: karim, values: { NO3: 62 }, notes: 'Contrôle mensuel du forage.' },
    { daysAgo: 19, point: 'STA-OUT', parameters: PHYSCHEM, collector: thomas, status: 'VALIDATED', analyst: aicha, validator: karim },
    { daysAgo: 18, point: 'RES-NORD', parameters: MICRO, collector: marc, status: 'VALIDATED', analyst: julien, validator: karim },
    { daysAgo: 16, point: 'RIV-AMONT', parameters: FULL, collector: marc, status: 'VALIDATED', analyst: aicha, validator: karim, values: { ECOLI: 12, COLI: 40, TURB: 3.2, CL2: 0 }, notes: 'Eau brute après un épisode pluvieux.' },
    { daysAgo: 14, point: 'RES-MAIRIE', parameters: PHYSCHEM, collector: thomas, status: 'VALIDATED', analyst: julien, validator: karim },
    { daysAgo: 12, point: 'STA-OUT', parameters: MICRO, collector: thomas, status: 'VALIDATED', analyst: aicha, validator: karim },
    { daysAgo: 9, point: 'FOR-01', parameters: PHYSCHEM, collector: thomas, status: 'ANALYZED', analyst: aicha, values: { NO3: 55 } },
    { daysAgo: 8, point: 'RES-NORD', parameters: PHYSCHEM, collector: marc, status: 'ANALYZED', analyst: julien, values: { CL2: 0.05 }, notes: 'Chlore résiduel faible signalé par le technicien.' },
    { daysAgo: 7, point: 'RES-MAIRIE', parameters: MICRO, collector: thomas, status: 'ANALYZED', analyst: karim, notes: 'Analyse réalisée par le responsable labo (principe des 4 yeux).' },
    { daysAgo: 6, point: 'STA-OUT', parameters: FULL, collector: thomas, status: 'ANALYZED', analyst: aicha },
    { daysAgo: 5, point: 'RIV-AMONT', parameters: PHYSCHEM, collector: marc, status: 'REGISTERED', analyst: julien, values: { COND: 1850 }, rejectionReason: "Conductivité incohérente avec l'historique du point : refaire la mesure." },
    { daysAgo: 4, point: 'FOR-01', parameters: MICRO, collector: thomas, status: 'REGISTERED', analyst: aicha, partial: ['ECOLI'] },
    { daysAgo: 3, point: 'RES-NORD', parameters: FULL, collector: marc, status: 'REGISTERED' },
    { daysAgo: 2, point: 'STA-OUT', parameters: PHYSCHEM, collector: thomas, status: 'REGISTERED' },
    { daysAgo: 1, point: 'RES-MAIRIE', parameters: PHYSCHEM, collector: aicha, status: 'REGISTERED', notes: "Prélèvement effectué par l'analyste." },
    { daysAgo: 0, point: 'RIV-AMONT', parameters: MICRO, collector: thomas, status: 'REGISTERED' },
  ];

  for (const spec of specs) {
    const sampledAt = at(spec.daysAgo, spec.daysAgo === 0 ? 7 : 8);
    const analyzedAt = new Date(sampledAt.getTime() + DAY);
    const validatedAt = new Date(sampledAt.getTime() + 2 * DAY);
    const withValues = spec.status !== 'REGISTERED' || spec.rejectionReason !== undefined || spec.partial !== undefined;
    await prisma.sample.create({
      data: {
        samplingPointId: pointIds[spec.point],
        sampledAt,
        notes: spec.notes ?? null,
        status: spec.status,
        collectedById: spec.collector,
        analyzedById: spec.status !== 'REGISTERED' ? spec.analyst : null,
        analyzedAt: spec.status !== 'REGISTERED' ? analyzedAt : null,
        validatedById: spec.status === 'VALIDATED' ? spec.validator : null,
        validatedAt: spec.status === 'VALIDATED' ? validatedAt : null,
        rejectionReason: spec.rejectionReason ?? null,
        createdAt: sampledAt,
        results: {
          create: spec.parameters.map((code) => {
            const filled = withValues && (!spec.partial || spec.partial.includes(code));
            return {
              parameterId: parameterIds[code],
              value: filled ? (spec.values?.[code] ?? typical[code]) : null,
              enteredById: filled ? spec.analyst : null,
              enteredAt: filled ? analyzedAt : null,
            };
          }),
        },
      },
    });
  }

  // Ready-made privileges illustrating ALLOW (temporary) and DENY.
  const permissionId = async (code: string) => (await prisma.permission.findUniqueOrThrow({ where: { code } })).id;
  await prisma.userPrivilege.create({
    data: {
      userId: julien,
      permissionId: await permissionId('result:validate'),
      effect: 'ALLOW',
      reason: 'Intérim pendant les congés du responsable laboratoire',
      grantedById: karim,
      expiresAt: new Date(now + 7 * DAY),
    },
  });
  await prisma.userPrivilege.create({
    data: {
      userId: marc,
      permissionId: await permissionId('sample:create'),
      effect: 'DENY',
      reason: 'Habilitation prélèvement suspendue : formation hygiène à renouveler',
      grantedById: karim,
      expiresAt: new Date(now + 30 * DAY),
    },
  });
}

export async function seed(prisma: PrismaClient, options: { reset?: boolean } = {}) {
  if (options.reset) await resetDatabase(prisma);
  await syncCatalog(prisma);
  await syncSystemRoles(prisma);
  if ((await prisma.user.count()) > 0) return { demoData: false };
  const users = await seedDemoUsers(prisma);
  await seedLaboratory(prisma, users);
  return { demoData: true };
}

if (require.main === module) {
  const prisma = new PrismaClient();
  const reset = process.argv.includes('--reset');
  seed(prisma, { reset })
    .then((result) => {
      console.log(
        result.demoData
          ? `Seed done: ${DEMO_ACCOUNTS.length} demo accounts (password: ${DEMO_PASSWORD}), roles: ${Object.values(ROLE).join(', ')}`
          : 'Seed done: catalog and built-in roles synchronized (existing users kept, use --reset to start over)',
      );
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
