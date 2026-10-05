import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { config, DEMO_PASSWORD } from '../config';
import { AppError, ErrorCode } from '../common/errors';
import type { AuthContext } from '../common/request-context';
import { DEMO_ACCOUNTS } from '../demo/demo-accounts';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { IssuedTokens, TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Password login with brute-force protection: after LOGIN_MAX_ATTEMPTS
   * consecutive failures the account is locked for LOGIN_LOCK_MINUTES.
   */
  async login(emailInput: string, password: string, ip?: string): Promise<IssuedTokens> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const invalid = () =>
      AppError.unauthorized(ErrorCode.INVALID_CREDENTIALS, 'Invalid e-mail or password');

    if (!user) {
      await this.audit.log({ action: AuditAction.AUTH_LOGIN_FAILED, details: { email, reason: 'UNKNOWN_EMAIL' }, ip });
      throw invalid();
    }

    const now = new Date();
    if (user.status === UserStatus.LOCKED) {
      if (user.lockedUntil && user.lockedUntil > now) {
        await this.audit.log({
          actor: user,
          action: AuditAction.AUTH_LOGIN_FAILED,
          details: { reason: 'ACCOUNT_LOCKED' },
          ip,
        });
        throw AppError.unauthorized(ErrorCode.ACCOUNT_LOCKED, 'Account temporarily locked', {
          lockedUntil: user.lockedUntil,
        });
      }
      // The lock has expired: the account becomes usable again.
      user.status = UserStatus.ACTIVE;
      user.failedLoginAttempts = 0;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: UserStatus.ACTIVE, failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const passwordOk = await this.passwords.verify(user.passwordHash, password);
    if (!passwordOk) {
      if (user.status === UserStatus.DISABLED) {
        await this.audit.log({ actor: user, action: AuditAction.AUTH_LOGIN_FAILED, details: { reason: 'BAD_PASSWORD' }, ip });
        throw invalid();
      }
      const attempts = user.failedLoginAttempts + 1;
      if (attempts >= config.loginMaxAttempts) {
        const lockedUntil = new Date(now.getTime() + config.loginLockMinutes * 60_000);
        await this.prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: attempts, status: UserStatus.LOCKED, lockedUntil },
        });
        await this.audit.log({
          actor: user,
          action: AuditAction.AUTH_ACCOUNT_LOCKED,
          targetType: 'user',
          targetId: user.id,
          details: { attempts, lockedUntil },
          ip,
        });
        throw AppError.unauthorized(ErrorCode.ACCOUNT_LOCKED, 'Account temporarily locked', { lockedUntil });
      }
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: attempts } });
      await this.audit.log({
        actor: user,
        action: AuditAction.AUTH_LOGIN_FAILED,
        details: { reason: 'BAD_PASSWORD', attempts },
        ip,
      });
      throw invalid();
    }

    if (user.status === UserStatus.DISABLED) {
      await this.audit.log({ actor: user, action: AuditAction.AUTH_LOGIN_FAILED, details: { reason: 'ACCOUNT_DISABLED' }, ip });
      throw AppError.unauthorized(ErrorCode.ACCOUNT_DISABLED, 'This account is disabled');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now },
    });
    await this.audit.log({ actor: user, action: AuditAction.AUTH_LOGIN_SUCCEEDED, ip });
    return this.tokens.issue(user);
  }

  refresh(rawToken: string | undefined): Promise<IssuedTokens> {
    if (!rawToken) {
      throw AppError.unauthorized(ErrorCode.INVALID_REFRESH_TOKEN, 'Missing refresh token');
    }
    return this.tokens.rotate(rawToken);
  }

  async logout(rawToken: string | undefined, ip?: string): Promise<void> {
    if (!rawToken) return;
    const userId = await this.tokens.revoke(rawToken);
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
      await this.audit.log({ actor: user, action: AuditAction.AUTH_LOGOUT, ip });
    }
  }

  async changePassword(auth: AuthContext, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.user.id } });
    if (!(await this.passwords.verify(user.passwordHash, currentPassword))) {
      throw AppError.badRequest(ErrorCode.INVALID_CURRENT_PASSWORD, 'Current password is incorrect');
    }
    this.passwords.assertStrong(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await this.passwords.hash(newPassword) },
    });
    await this.audit.logAs(auth, AuditAction.AUTH_PASSWORD_CHANGED, { type: 'user', id: user.id });
  }

  /** Demo accounts with their current roles and status (only when DEMO_MODE is on). */
  async demoAccounts() {
    if (!config.demoMode) return { enabled: false, password: null, accounts: [] };
    const users = await this.prisma.user.findMany({
      where: { email: { in: DEMO_ACCOUNTS.map((account) => account.email) } },
      include: { roles: { include: { role: { select: { code: true, name: true } } } } },
    });
    const byEmail = new Map(users.map((user) => [user.email, user]));
    const accounts = DEMO_ACCOUNTS.flatMap((account) => {
      const user = byEmail.get(account.email);
      if (!user) return [];
      return [
        {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          status: user.status,
          description: account.description,
          roles: user.roles.map((assignment) => assignment.role),
        },
      ];
    });
    return { enabled: true, password: DEMO_PASSWORD, accounts };
  }
}
