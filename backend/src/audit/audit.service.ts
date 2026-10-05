import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthContext } from '../common/request-context';
import { Page, PaginationQuery, paginationArgs } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction } from './audit-actions';

export interface AuditEntry {
  actor?: { id: string; email: string } | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ip?: string;
}

export interface AuditQuery extends PaginationQuery {
  action?: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  search?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Records an audit entry. Never throws: auditing must not break the request. */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actor?.id ?? null,
          actorEmail: entry.actor?.email ?? null,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          details: (entry.details ?? undefined) as Prisma.InputJsonValue | undefined,
          ip: entry.ip ?? null,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to write audit entry ${entry.action}`, error as Error);
    }
  }

  /** Shortcut for an action performed by the authenticated user. */
  logAs(auth: AuthContext, action: AuditAction, target?: { type: string; id: string }, details?: Record<string, unknown>) {
    return this.log({
      actor: { id: auth.user.id, email: auth.user.email },
      action,
      targetType: target?.type,
      targetId: target?.id,
      details,
    });
  }

  async list(query: AuditQuery): Promise<Page<unknown>> {
    const where: Prisma.AuditLogWhereInput = {
      action: query.action || undefined,
      actorId: query.actorId || undefined,
      targetType: query.targetType || undefined,
      targetId: query.targetId || undefined,
      actorEmail: query.search ? { contains: query.search, mode: 'insensitive' } : undefined,
      createdAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginationArgs(query) }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async distinctActions(): Promise<string[]> {
    const rows = await this.prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    });
    return rows.map((row) => row.action);
  }
}
