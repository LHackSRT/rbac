import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { AccessTokenPayload } from '../authorization/access.guard';
import { config } from '../config';
import { AppError, ErrorCode } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

/** A revoked refresh token presented again within this delay is treated as a concurrent refresh, not a theft. */
const REUSE_GRACE_MS = 10_000;

export interface IssuedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async issue(user: { id: string; email: string }): Promise<IssuedTokens> {
    const payload: AccessTokenPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: config.jwtAccessSecret,
      expiresIn: config.accessTokenTtlSeconds,
    });
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 24 * 3600 * 1000);
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: sha256(refreshToken), expiresAt: refreshExpiresAt },
    });
    return { accessToken, expiresIn: config.accessTokenTtlSeconds, refreshToken, refreshExpiresAt };
  }

  /** Refresh token rotation: the presented token is revoked and a new pair is issued. */
  async rotate(rawToken: string): Promise<IssuedTokens> {
    const now = new Date();
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: { select: { id: true, email: true, status: true } } },
    });
    if (!stored) throw this.invalid();

    if (stored.revokedAt) {
      if (now.getTime() - stored.revokedAt.getTime() > REUSE_GRACE_MS) {
        // A token that was already rotated is being replayed: revoke every session of the user.
        await this.revokeAll(stored.userId);
        await this.audit.log({
          actor: { id: stored.user.id, email: stored.user.email },
          action: AuditAction.AUTH_REFRESH_TOKEN_REUSED,
          targetType: 'user',
          targetId: stored.userId,
        });
      }
      throw this.invalid();
    }
    if (stored.expiresAt <= now) throw this.invalid();
    if (stored.user.status === UserStatus.DISABLED) {
      await this.revokeAll(stored.userId);
      throw AppError.unauthorized(ErrorCode.ACCOUNT_DISABLED, 'This account is disabled');
    }

    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (revoked.count === 0) throw this.invalid();
    return this.issue(stored.user);
  }

  async revoke(rawToken: string): Promise<string | null> {
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (!stored) return null;
    await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return stored.userId;
  }

  async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private invalid() {
    return AppError.unauthorized(ErrorCode.INVALID_REFRESH_TOKEN, 'Invalid or expired refresh token');
  }
}
