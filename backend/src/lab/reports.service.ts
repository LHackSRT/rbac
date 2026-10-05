import { Injectable } from '@nestjs/common';
import { Prisma, SampleStatus } from '@prisma/client';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { isCompliant, sampleReference } from './compliance';
import { ReportQuery } from './dto/lab.dto';
import { sampleInclude, toSampleSummary } from './samples.service';

export interface ReportRow {
  sampleId: string;
  reference: string;
  samplingPoint: { code: string; name: string };
  sampledAt: Date;
  validatedAt: Date | null;
  validatedBy: string | null;
  parameter: { code: string; name: string; unit: string; minValue: number | null; maxValue: number | null };
  value: number;
  compliant: boolean;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'number' ? String(value).replace('.', ',') : String(value);
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Validated results only, flattened one row per measured parameter. */
  async rows(query: Omit<ReportQuery, 'page' | 'pageSize'>): Promise<ReportRow[]> {
    const where: Prisma.ResultWhereInput = {
      value: { not: null },
      parameterId: query.parameterId,
      sample: {
        status: SampleStatus.VALIDATED,
        samplingPointId: query.samplingPointId,
        sampledAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
      },
    };
    const results = await this.prisma.result.findMany({
      where,
      include: {
        parameter: true,
        sample: { include: { samplingPoint: true, validatedBy: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: [{ sample: { sampledAt: 'desc' } }, { parameter: { code: 'asc' } }],
    });
    const rows = results.map((result) => ({
      sampleId: result.sample.id,
      reference: sampleReference(result.sample.seq),
      samplingPoint: { code: result.sample.samplingPoint.code, name: result.sample.samplingPoint.name },
      sampledAt: result.sample.sampledAt,
      validatedAt: result.sample.validatedAt,
      validatedBy: result.sample.validatedBy
        ? `${result.sample.validatedBy.firstName} ${result.sample.validatedBy.lastName}`
        : null,
      parameter: {
        code: result.parameter.code,
        name: result.parameter.name,
        unit: result.parameter.unit,
        minValue: result.parameter.minValue,
        maxValue: result.parameter.maxValue,
      },
      value: result.value as number,
      compliant: isCompliant(result.value, result.parameter.minValue, result.parameter.maxValue) as boolean,
    }));
    return query.nonCompliantOnly ? rows.filter((row) => !row.compliant) : rows;
  }

  async page(query: ReportQuery) {
    const rows = await this.rows(query);
    const start = (query.page - 1) * query.pageSize;
    return { items: rows.slice(start, start + query.pageSize), total: rows.length, page: query.page, pageSize: query.pageSize };
  }

  /** CSV for spreadsheet software configured in French (";" separator, decimal comma, UTF-8 BOM). */
  async csv(auth: AuthContext, query: ReportQuery): Promise<string> {
    const rows = await this.rows(query);
    const header = [
      'Référence',
      'Point de prélèvement',
      'Date de prélèvement',
      'Paramètre',
      'Valeur',
      'Unité',
      'Seuil min',
      'Seuil max',
      'Conformité',
      'Validé le',
      'Validé par',
    ];
    const lines = rows.map((row) =>
      [
        row.reference,
        `${row.samplingPoint.code} - ${row.samplingPoint.name}`,
        row.sampledAt.toISOString(),
        row.parameter.name,
        row.value,
        row.parameter.unit,
        row.parameter.minValue,
        row.parameter.maxValue,
        row.compliant ? 'Conforme' : 'Non conforme',
        row.validatedAt?.toISOString(),
        row.validatedBy,
      ]
        .map(csvCell)
        .join(';'),
    );
    await this.audit.logAs(auth, AuditAction.REPORT_EXPORTED, undefined, {
      rows: rows.length,
      filters: { ...query, page: undefined, pageSize: undefined },
    });
    return '﻿' + [header.join(';'), ...lines].join('\r\n') + '\r\n';
  }

  async dashboard(auth: AuthContext) {
    const seesUnvalidated = auth.permissions.hasAny(['result:enter', 'result:validate']);
    const seesValidated = seesUnvalidated || auth.permissions.has('result:read');
    const visibleStatuses = seesUnvalidated
      ? [SampleStatus.REGISTERED, SampleStatus.ANALYZED, SampleStatus.VALIDATED]
      : seesValidated
        ? [SampleStatus.VALIDATED]
        : [];

    const [byStatus, mine, samplingPoints, parameters, recent] = await Promise.all([
      this.prisma.sample.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.sample.count({ where: { collectedById: auth.user.id } }),
      this.prisma.samplingPoint.count({ where: { active: true } }),
      this.prisma.parameter.count({ where: { active: true } }),
      this.prisma.sample.findMany({
        where: { status: { in: visibleStatuses } },
        include: sampleInclude,
        orderBy: { sampledAt: 'desc' },
        take: 100,
      }),
    ]);

    const counts = { REGISTERED: 0, ANALYZED: 0, VALIDATED: 0 } as Record<SampleStatus, number>;
    for (const group of byStatus) counts[group.status] = group._count._all;

    const alerts = recent
      .map((sample) => ({
        ...toSampleSummary(sample, auth),
        nonCompliantParameters: sample.results
          .filter((result) => isCompliant(result.value, result.parameter.minValue, result.parameter.maxValue) === false)
          .map((result) => ({ code: result.parameter.code, name: result.parameter.name, value: result.value, unit: result.parameter.unit })),
      }))
      .filter((sample) => sample.nonCompliantParameters.length > 0)
      .slice(0, 6);

    return {
      counts: { ...counts, total: counts.REGISTERED + counts.ANALYZED + counts.VALIDATED },
      mySamples: mine,
      activeSamplingPoints: samplingPoints,
      activeParameters: parameters,
      nonCompliantAlerts: alerts,
    };
  }
}
