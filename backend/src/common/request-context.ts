import type { Request } from 'express';
import type { EffectivePermissions } from '../authorization/permission-resolver';

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuthContext {
  user: AuthenticatedUser;
  permissions: EffectivePermissions;
}

export type AppRequest = Request & { auth?: AuthContext };

export function clientIp(request: Request): string | undefined {
  return request.ip ?? request.socket?.remoteAddress ?? undefined;
}
