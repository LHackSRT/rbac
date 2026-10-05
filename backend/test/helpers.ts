import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { seed } from '../prisma/seed';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { DEMO_PASSWORD } from '../src/config';
import { PrismaService } from '../src/prisma/prisma.service';

export const EMAIL = {
  superAdmin: 'superadmin@aqualab.test',
  admin: 'admin@aqualab.test',
  labManager: 'resp.labo@aqualab.test',
  quality: 'qualite@aqualab.test',
  analyst1: 'analyste1@aqualab.test',
  analyst2: 'analyste2@aqualab.test',
  technician1: 'technicien1@aqualab.test',
  technician2: 'technicien2@aqualab.test',
  viewer: 'consultant@aqualab.test',
} as const;

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
  /** Logs in and returns an "Authorization" header value. */
  login: (email: string, password?: string) => Promise<string>;
  userId: (email: string) => Promise<string>;
  roleId: (code: string) => Promise<string>;
  close: () => Promise<void>;
}

/** Boots the application against a freshly seeded test database. */
export async function createTestContext(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  await seed(prisma, { reset: true });

  const http = () => request(app.getHttpServer());
  return {
    app,
    prisma,
    http,
    login: async (email, password = DEMO_PASSWORD) => {
      const response = await http().post('/api/auth/login').send({ email, password }).expect(200);
      return `Bearer ${response.body.accessToken}`;
    },
    userId: async (email) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id,
    roleId: async (code) => (await prisma.role.findUniqueOrThrow({ where: { code } })).id,
    close: () => app.close(),
  };
}
