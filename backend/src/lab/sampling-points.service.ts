import { Injectable } from '@nestjs/common';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { AppError, ErrorCode } from '../common/errors';
import type { AuthContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSamplingPointDto, UpdateSamplingPointDto } from './dto/lab.dto';

@Injectable()
export class SamplingPointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(includeInactive = false) {
    const points = await this.prisma.samplingPoint.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { code: 'asc' },
      include: { _count: { select: { samples: true } } },
    });
    return points.map(({ _count, ...point }) => ({ ...point, sampleCount: _count.samples }));
  }

  async create(auth: AuthContext, dto: CreateSamplingPointDto) {
    if (await this.prisma.samplingPoint.findUnique({ where: { code: dto.code } })) {
      throw AppError.conflict(ErrorCode.CODE_ALREADY_USED, 'Code already used');
    }
    const point = await this.prisma.samplingPoint.create({ data: dto });
    await this.audit.logAs(auth, AuditAction.SAMPLING_POINT_CREATED, { type: 'sampling-point', id: point.id }, { ...dto });
    return point;
  }

  async update(auth: AuthContext, id: string, dto: UpdateSamplingPointDto) {
    await this.findOrThrow(id);
    const point = await this.prisma.samplingPoint.update({ where: { id }, data: dto });
    await this.audit.logAs(auth, AuditAction.SAMPLING_POINT_UPDATED, { type: 'sampling-point', id }, { ...dto });
    return point;
  }

  async remove(auth: AuthContext, id: string) {
    const point = await this.findOrThrow(id);
    const samples = await this.prisma.sample.count({ where: { samplingPointId: id } });
    if (samples > 0) {
      throw AppError.conflict(ErrorCode.IN_USE, 'Sampling point has samples; deactivate it instead', { samples });
    }
    await this.prisma.samplingPoint.delete({ where: { id } });
    await this.audit.logAs(auth, AuditAction.SAMPLING_POINT_DELETED, { type: 'sampling-point', id }, { code: point.code });
  }

  private async findOrThrow(id: string) {
    const point = await this.prisma.samplingPoint.findUnique({ where: { id } });
    if (!point) throw AppError.notFound('Sampling point');
    return point;
  }
}
