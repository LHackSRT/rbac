import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Machine-readable error codes returned by the API. The frontend translates
 * them for the user.
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',

  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',

  FORBIDDEN: 'FORBIDDEN',
  PRIVILEGE_ESCALATION: 'PRIVILEGE_ESCALATION',
  SELF_MODIFICATION_FORBIDDEN: 'SELF_MODIFICATION_FORBIDDEN',
  SUPER_ADMIN_PROTECTED: 'SUPER_ADMIN_PROTECTED',
  EMAIL_ALREADY_USED: 'EMAIL_ALREADY_USED',

  ROLE_CODE_ALREADY_USED: 'ROLE_CODE_ALREADY_USED',
  ROLE_CYCLE: 'ROLE_CYCLE',
  ROLE_IN_USE: 'ROLE_IN_USE',
  SYSTEM_ROLE_PROTECTED: 'SYSTEM_ROLE_PROTECTED',
  UNKNOWN_PERMISSION: 'UNKNOWN_PERMISSION',
  WILDCARD_PRIVILEGE_FORBIDDEN: 'WILDCARD_PRIVILEGE_FORBIDDEN',

  NOT_OWNER: 'NOT_OWNER',
  INVALID_SAMPLE_STATUS: 'INVALID_SAMPLE_STATUS',
  SAMPLE_LOCKED: 'SAMPLE_LOCKED',
  RESULTS_INCOMPLETE: 'RESULTS_INCOMPLETE',
  UNKNOWN_SAMPLE_PARAMETER: 'UNKNOWN_SAMPLE_PARAMETER',
  FOUR_EYES_VIOLATION: 'FOUR_EYES_VIOLATION',
  CODE_ALREADY_USED: 'CODE_ALREADY_USED',
  IN_USE: 'IN_USE',
  INACTIVE_REFERENCE: 'INACTIVE_REFERENCE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export class AppError extends HttpException {
  constructor(status: HttpStatus, code: ErrorCode, message: string, details?: unknown) {
    super({ statusCode: status, code, message, details } satisfies ErrorBody, status);
  }

  static notFound(what: string) {
    return new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, `${what} not found`);
  }

  static forbidden(code: ErrorCode, message: string, details?: unknown) {
    return new AppError(HttpStatus.FORBIDDEN, code, message, details);
  }

  static conflict(code: ErrorCode, message: string, details?: unknown) {
    return new AppError(HttpStatus.CONFLICT, code, message, details);
  }

  static badRequest(code: ErrorCode, message: string, details?: unknown) {
    return new AppError(HttpStatus.BAD_REQUEST, code, message, details);
  }

  static unauthorized(code: ErrorCode, message: string, details?: unknown) {
    return new AppError(HttpStatus.UNAUTHORIZED, code, message, details);
  }
}
