import { Injectable } from '@nestjs/common';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { AppError, ErrorCode } from '../common/errors';
import type { AuthContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { CreateParameterDto, UpdateParameterDto } from './dto/lab.dto';

@Injectable()
export class ParametersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(includeInactive = false) {
    return this.prisma.parameter.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });
  }

  async create(auth: AuthContext, dto: CreateParameterDto) {
    if (await this.prisma.parameter.findUnique({ where: { code: dto.code } })) {
      throw AppError.conflict(ErrorCode.CODE_ALREADY_USED, 'Code already used');
    }
    this.assertBounds(dto.minValue ?? null, dto.maxValue ?? null);
    const parameter = await this.prisma.parameter.create({ data: dto });
    await this.audit.logAs(auth, AuditAction.PARAMETER_CREATED, { type: 'parameter', id: parameter.id }, { ...dto });
    return parameter;
  }

  async update(auth: AuthContext, id: string, dto: UpdateParameterDto) {
    const existing = await this.findOrThrow(id);
    this.assertBounds(
      dto.minValue === undefined ? existing.minValue : dto.minValue,
      dto.maxValue === undefined ? existing.maxValue : dto.maxValue,
    );
    const parameter = await this.prisma.parameter.update({ where: { id }, data: dto });
    await this.audit.logAs(auth, AuditAction.PARAMETER_UPDATED, { type: 'parameter', id }, {
      code: existing.code,
      before: { minValue: existing.minValue, maxValue: existing.maxValue },
      changes: { ...dto },
    });
    return parameter;
  }

  async remove(auth: AuthContext, id: string) {
    const parameter = await this.findOrThrow(id);
    const results = await this.prisma.result.count({ where: { parameterId: id } });
    if (results > 0) {
      throw AppError.conflict(ErrorCode.IN_USE, 'Parameter is used by samples; deactivate it instead', { results });
    }
    await this.prisma.parameter.delete({ where: { id } });
    await this.audit.logAs(auth, AuditAction.PARAMETER_DELETED, { type: 'parameter', id }, { code: parameter.code });
  }

  private assertBounds(minValue: number | null, maxValue: number | null) {
    if (minValue !== null && maxValue !== null && minValue > maxValue) {
      throw AppError.badRequest(ErrorCode.VALIDATION_ERROR, 'minValue must be lower than or equal to maxValue', [
        { field: 'minValue', errors: ['minValue must be lower than or equal to maxValue'] },
      ]);
    }
  }

  private async findOrThrow(id: string) {
    const parameter = await this.prisma.parameter.findUnique({ where: { id } });
    if (!parameter) throw AppError.notFound('Parameter');
    return parameter;
  }
}
