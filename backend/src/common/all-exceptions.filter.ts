import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { ErrorBody, ErrorCode } from './errors';
import { AppRequest, clientIp } from './request-context';

/**
 * Normalizes every error into { statusCode, code, message, details } and
 * records each 403 in the audit log (refused access attempts).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly audit: AuditService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<AppRequest>();
    const response = http.getResponse<Response>();
    const body = this.toBody(exception);

    if (body.statusCode === HttpStatus.FORBIDDEN && request.auth) {
      await this.audit.log({
        actor: { id: request.auth.user.id, email: request.auth.user.email },
        action: AuditAction.ACCESS_DENIED,
        details: { method: request.method, path: request.originalUrl, code: body.code, details: body.details },
        ip: clientIp(request),
      });
    }

    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof ThrottlerException) {
      return { statusCode: 429, code: ErrorCode.TOO_MANY_REQUESTS, message: 'Too many requests' };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'object' && payload !== null && 'code' in payload) {
        return payload as ErrorBody;
      }
      const message =
        typeof payload === 'string' ? payload : ((payload as { message?: string }).message ?? exception.message);
      return { statusCode: status, code: this.codeForStatus(status), message: String(message) };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2025') {
        return { statusCode: 404, code: ErrorCode.NOT_FOUND, message: 'Resource not found' };
      }
      if (exception.code === 'P2002') {
        return { statusCode: 409, code: ErrorCode.CONFLICT, message: 'Unique constraint violation' };
      }
      if (exception.code === 'P2003') {
        return {
          statusCode: 409,
          code: ErrorCode.IN_USE,
          message: 'The resource is referenced by other records',
        };
      }
    }
    this.logger.error(exception);
    return { statusCode: 500, code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' };
  }

  private codeForStatus(status: number): ErrorBody['code'] {
    switch (status) {
      case 400:
        return ErrorCode.VALIDATION_ERROR;
      case 401:
        return ErrorCode.UNAUTHENTICATED;
      case 403:
        return ErrorCode.FORBIDDEN;
      case 404:
        return ErrorCode.NOT_FOUND;
      case 409:
        return ErrorCode.CONFLICT;
      case 429:
        return ErrorCode.TOO_MANY_REQUESTS;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
