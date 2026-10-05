import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { config } from '../config';
import { AppError, ErrorCode } from '../common/errors';
import type { AppRequest } from '../common/request-context';
import { AuthorizationService } from './authorization.service';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY, PermissionRequirement } from './decorators';

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

/**
 * Global guard: authenticates the bearer token, loads the effective
 * permissions of the user and enforces @RequirePermissions/@RequireAnyPermission.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly authorization: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<AppRequest>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw AppError.unauthorized(ErrorCode.UNAUTHENTICATED, 'Missing access token');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: config.jwtAccessSecret });
    } catch {
      throw AppError.unauthorized(ErrorCode.UNAUTHENTICATED, 'Invalid or expired access token');
    }

    const access = await this.authorization.loadUserAccess(payload.sub);
    if (!access) {
      throw AppError.unauthorized(ErrorCode.UNAUTHENTICATED, 'Unknown user');
    }
    if (access.user.status === UserStatus.DISABLED) {
      throw AppError.unauthorized(ErrorCode.ACCOUNT_DISABLED, 'This account is disabled');
    }

    const { status: _status, ...user } = access.user;
    request.auth = { user, permissions: access.permissions };

    const requirement = this.reflector.getAllAndOverride<PermissionRequirement>(PERMISSIONS_KEY, targets);
    if (requirement) {
      const granted =
        requirement.mode === 'all'
          ? access.permissions.hasAll(requirement.permissions)
          : access.permissions.hasAny(requirement.permissions);
      if (!granted) {
        throw AppError.forbidden(ErrorCode.FORBIDDEN, 'Missing permission', {
          mode: requirement.mode,
          required: requirement.permissions,
          missing: requirement.permissions.filter((code) => !access.permissions.has(code)),
        });
      }
    }
    return true;
  }

  private extractBearerToken(request: AppRequest): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }
}
