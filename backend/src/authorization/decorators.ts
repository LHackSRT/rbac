import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AppRequest, AuthContext } from '../common/request-context';
import type { PermissionCode } from './catalog';

export const IS_PUBLIC_KEY = 'auth:public';
export const PERMISSIONS_KEY = 'rbac:permissions';

export interface PermissionRequirement {
  mode: 'all' | 'any';
  permissions: PermissionCode[];
}

/** Route reachable without authentication. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** The authenticated user must hold every listed permission. */
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, { mode: 'all', permissions } satisfies PermissionRequirement);

/** The authenticated user must hold at least one of the listed permissions. */
export const RequireAnyPermission = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, { mode: 'any', permissions } satisfies PermissionRequirement);

/** Injects the authentication context (user + effective permissions). */
export const Auth = createParamDecorator((_data: unknown, context: ExecutionContext): AuthContext => {
  const request = context.switchToHttp().getRequest<AppRequest>();
  return request.auth!;
});
