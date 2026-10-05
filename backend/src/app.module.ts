import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { SecurityModule } from './auth/security.module';
import { AccessGuard } from './authorization/access.guard';
import { AuthorizationModule } from './authorization/authorization.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { config } from './config';
import { HealthController } from './health.controller';
import { LabModule } from './lab/lab.module';
import { PrismaModule } from './prisma/prisma.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // Only applied where ThrottlerGuard is used (the login route).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: config.loginRateLimitPerMinute }]),
    PrismaModule,
    AuditModule,
    SecurityModule,
    AuthorizationModule,
    AuthModule,
    UsersModule,
    RolesModule,
    LabModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
