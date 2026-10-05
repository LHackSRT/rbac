import { Injectable } from '@nestjs/common';
import { Prisma, SampleStatus } from '@prisma/client';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { P } from '../authorization/catalog';
import { AppError, ErrorCode } from '../common/errors';
import { paginationArgs } from '../common/pagination';
import type { AuthContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { isCompliant, sampleReference } from './compliance';
import { CreateSampleDto, EnterResultsDto, ListSamplesQuery, UpdateSampleDto } from './dto/lab.dto';

const userRef = { select: { id: true, email: true, firstName: true, lastName: true } } as const;

export const sampleInclude = {
  samplingPoint: { select: { id: true, code: true, name: true, type: true } },
  collectedBy: userRef,
  analyzedBy: userRef,
  validatedBy: userRef,
  results: {
    include: { parameter: true, enteredBy: userRef },
    orderBy: { parameter: { code: 'asc' } },
  },
} satisfies Prisma.SampleInclude;

type SampleWithRelations = Prisma.SampleGetPayload<{ include: typeof sampleInclude }>;

/**
 * Result visibility: users who enter or validate results see them at every
 * stage; holders of result:read only see results of validated samples.
 */
export function resultsVisibleFor(auth: AuthContext, status: SampleStatus): boolean {
  const seesUnvalidated = auth.permissions.hasAny([P.RESULT_ENTER, P.RESULT_VALIDATE]);
  if (status === SampleStatus.VALIDATED) return seesUnvalidated || auth.permissions.has(P.RESULT_READ);
  return seesUnvalidated;
}

export function toSampleSummary(sample: SampleWithRelations, auth: AuthContext) {
  const visible = resultsVisibleFor(auth, sample.status);
  const compliance = sample.results.map((result) =>
    isCompliant(result.value, result.parameter.minValue, result.parameter.maxValue),
  );
  return {
    id: sample.id,
    reference: sampleReference(sample.seq),
    samplingPoint: sample.samplingPoint,
    sampledAt: sample.sampledAt,
    notes: sample.notes,
    status: sample.status,
    collectedBy: sample.collectedBy,
    analyzedBy: sample.analyzedBy,
    analyzedAt: sample.analyzedAt,
    validatedBy: sample.validatedBy,
    validatedAt: sample.validatedAt,
    rejectionReason: sample.rejectionReason,
    createdAt: sample.createdAt,
    updatedAt: sample.updatedAt,
    parameterCount: sample.results.length,
    enteredCount: sample.results.filter((result) => result.value !== null).length,
    resultsVisible: visible,
    nonCompliantCount: visible ? compliance.filter((value) => value === false).length : null,
  };
}

export function toSampleDetail(sample: SampleWithRelations, auth: AuthContext) {
  const visible = resultsVisibleFor(auth, sample.status);
  return {
    ...toSampleSummary(sample, auth),
    results: sample.results.map((result) => ({
      id: result.id,
      parameter: {
        id: result.parameter.id,
        code: result.parameter.code,
        name: result.parameter.name,
        unit: result.parameter.unit,
        category: result.parameter.category,
        minValue: result.parameter.minValue,
        maxValue: result.parameter.maxValue,
      },
      value: visible ? result.value : null,
      compliant: visible ? isCompliant(result.value, result.parameter.minValue, result.parameter.maxValue) : null,
      entered: result.value !== null,
      enteredBy: visible ? result.enteredBy : null,
      enteredAt: visible ? result.enteredAt : null,
    })),
  };
}

@Injectable()
export class SamplesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(auth: AuthContext, query: ListSamplesQuery) {
    const search = query.search?.trim();
    const referenceNumber = search?.match(/(\d+)/)?.[1];
    const where: Prisma.SampleWhereInput = {
      status: query.status,
      samplingPointId: query.samplingPointId,
      collectedById: query.mine ? auth.user.id : undefined,
      OR: search
        ? [
            { notes: { contains: search, mode: 'insensitive' } },
            { samplingPoint: { name: { contains: search, mode: 'insensitive' } } },
            { samplingPoint: { code: { contains: search, mode: 'insensitive' } } },
            ...(referenceNumber ? [{ seq: Number(referenceNumber) }] : []),
          ]
        : undefined,
    };
    const [samples, total] = await this.prisma.$transaction([
      this.prisma.sample.findMany({
        where,
        include: sampleInclude,
        orderBy: [{ sampledAt: 'desc' }, { seq: 'desc' }],
        ...paginationArgs(query),
      }),
      this.prisma.sample.count({ where }),
    ]);
    return {
      items: samples.map((sample) => toSampleSummary(sample, auth)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(auth: AuthContext, id: string) {
    return toSampleDetail(await this.findOrThrow(id), auth);
  }

  async create(auth: AuthContext, dto: CreateSampleDto) {
    await this.assertActiveReferences(dto.samplingPointId, dto.parameterIds);
    const sample = await this.prisma.sample.create({
      data: {
        samplingPointId: dto.samplingPointId,
        sampledAt: dto.sampledAt,
        notes: dto.notes?.trim() || null,
        collectedById: auth.user.id,
        results: { create: dto.parameterIds.map((parameterId) => ({ parameterId })) },
      },
      include: sampleInclude,
    });
    await this.audit.logAs(auth, AuditAction.SAMPLE_CREATED, { type: 'sample', id: sample.id }, {
      reference: sampleReference(sample.seq),
      samplingPoint: sample.samplingPoint.code,
      parameters: sample.results.map((result) => result.parameter.code),
    });
    return toSampleDetail(sample, auth);
  }

  /** Owners can edit with sample:update:own, anyone with sample:update:any. Only registered samples are editable. */
  async update(auth: AuthContext, id: string, dto: UpdateSampleDto) {
    const sample = await this.findOrThrow(id);
    this.assertCanEdit(auth, sample);
    if (sample.status !== SampleStatus.REGISTERED) {
      throw AppError.conflict(ErrorCode.SAMPLE_LOCKED, 'Only registered samples can be modified', {
        status: sample.status,
      });
    }
    await this.assertActiveReferences(dto.samplingPointId, dto.parameterIds, sample);

    const currentParameterIds = sample.results.map((result) => result.parameterId);
    const addedParameterIds = (dto.parameterIds ?? []).filter((pid) => !currentParameterIds.includes(pid));
    const removedParameterIds = dto.parameterIds
      ? currentParameterIds.filter((pid) => !dto.parameterIds!.includes(pid))
      : [];

    await this.prisma.$transaction([
      this.prisma.result.deleteMany({ where: { sampleId: id, parameterId: { in: removedParameterIds } } }),
      this.prisma.result.createMany({ data: addedParameterIds.map((parameterId) => ({ sampleId: id, parameterId })) }),
      this.prisma.sample.update({
        where: { id },
        data: {
          samplingPointId: dto.samplingPointId,
          sampledAt: dto.sampledAt,
          notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
        },
      }),
    ]);
    await this.audit.logAs(auth, AuditAction.SAMPLE_UPDATED, { type: 'sample', id }, {
      reference: sampleReference(sample.seq),
      changes: { ...dto },
    });
    return this.get(auth, id);
  }

  async remove(auth: AuthContext, id: string) {
    const sample = await this.findOrThrow(id);
    if (sample.status === SampleStatus.VALIDATED) {
      throw AppError.conflict(ErrorCode.SAMPLE_LOCKED, 'Validated samples are locked for traceability');
    }
    await this.prisma.sample.delete({ where: { id } });
    await this.audit.logAs(auth, AuditAction.SAMPLE_DELETED, { type: 'sample', id }, {
      reference: sampleReference(sample.seq),
      status: sample.status,
    });
  }

  async enterResults(auth: AuthContext, id: string, dto: EnterResultsDto) {
    const sample = await this.findOrThrow(id);
    this.assertStatus(sample, SampleStatus.REGISTERED);
    const byParameter = new Map(sample.results.map((result) => [result.parameterId, result]));
    const unknown = dto.results.filter((entry) => !byParameter.has(entry.parameterId)).map((e) => e.parameterId);
    if (unknown.length > 0) {
      throw AppError.badRequest(ErrorCode.UNKNOWN_SAMPLE_PARAMETER, 'Parameter not requested for this sample', {
        unknown,
      });
    }

    const now = new Date();
    const changes = dto.results.filter((entry) => byParameter.get(entry.parameterId)!.value !== (entry.value ?? null));
    await this.prisma.$transaction(
      changes.map((entry) =>
        this.prisma.result.update({
          where: { id: byParameter.get(entry.parameterId)!.id },
          data:
            entry.value === null || entry.value === undefined
              ? { value: null, enteredById: null, enteredAt: null }
              : { value: entry.value, enteredById: auth.user.id, enteredAt: now },
        }),
      ),
    );
    if (changes.length > 0) {
      await this.audit.logAs(auth, AuditAction.RESULTS_ENTERED, { type: 'sample', id }, {
        reference: sampleReference(sample.seq),
        values: changes.map((entry) => ({
          parameter: byParameter.get(entry.parameterId)!.parameter.code,
          value: entry.value ?? null,
        })),
      });
    }
    return this.get(auth, id);
  }

  /** Marks the analysis as complete: every requested parameter must have a value. */
  async submit(auth: AuthContext, id: string) {
    const sample = await this.findOrThrow(id);
    this.assertStatus(sample, SampleStatus.REGISTERED);
    const missing = sample.results.filter((result) => result.value === null).map((result) => result.parameter.code);
    if (missing.length > 0) {
      throw AppError.badRequest(ErrorCode.RESULTS_INCOMPLETE, 'Some results are missing', { missing });
    }
    await this.prisma.sample.update({
      where: { id },
      data: { status: SampleStatus.ANALYZED, analyzedById: auth.user.id, analyzedAt: new Date(), rejectionReason: null },
    });
    await this.audit.logAs(auth, AuditAction.SAMPLE_SUBMITTED, { type: 'sample', id }, {
      reference: sampleReference(sample.seq),
    });
    return this.get(auth, id);
  }

  /**
   * Four-eyes principle (ISO/IEC 17025): nobody may validate results they
   * entered or submitted themselves, whatever their permissions.
   */
  async validate(auth: AuthContext, id: string) {
    const sample = await this.findOrThrow(id);
    this.assertStatus(sample, SampleStatus.ANALYZED);
    const enteredByActor = sample.results.some((result) => result.enteredById === auth.user.id);
    if (enteredByActor || sample.analyzedById === auth.user.id) {
      throw AppError.forbidden(ErrorCode.FOUR_EYES_VIOLATION, 'You cannot validate results you entered yourself', {
        reference: sampleReference(sample.seq),
      });
    }
    await this.prisma.sample.update({
      where: { id },
      data: { status: SampleStatus.VALIDATED, validatedById: auth.user.id, validatedAt: new Date() },
    });
    const nonCompliant = sample.results
      .filter((result) => isCompliant(result.value, result.parameter.minValue, result.parameter.maxValue) === false)
      .map((result) => result.parameter.code);
    await this.audit.logAs(auth, AuditAction.SAMPLE_VALIDATED, { type: 'sample', id }, {
      reference: sampleReference(sample.seq),
      nonCompliant,
    });
    return this.get(auth, id);
  }

  /** Sends the sample back for a new analysis; the values are kept for correction. */
  async reject(auth: AuthContext, id: string, reason: string) {
    const sample = await this.findOrThrow(id);
    this.assertStatus(sample, SampleStatus.ANALYZED);
    await this.prisma.sample.update({
      where: { id },
      data: { status: SampleStatus.REGISTERED, analyzedById: null, analyzedAt: null, rejectionReason: reason.trim() },
    });
    await this.audit.logAs(auth, AuditAction.SAMPLE_REJECTED, { type: 'sample', id }, {
      reference: sampleReference(sample.seq),
      reason,
    });
    return this.get(auth, id);
  }

  private async findOrThrow(id: string): Promise<SampleWithRelations> {
    const sample = await this.prisma.sample.findUnique({ where: { id }, include: sampleInclude });
    if (!sample) throw AppError.notFound('Sample');
    return sample;
  }

  private assertCanEdit(auth: AuthContext, sample: SampleWithRelations) {
    if (auth.permissions.has(P.SAMPLE_UPDATE_ANY)) return;
    if (auth.permissions.has(P.SAMPLE_UPDATE_OWN) && sample.collectedById === auth.user.id) return;
    throw AppError.forbidden(ErrorCode.NOT_OWNER, 'You can only modify the samples you collected', {
      required: [P.SAMPLE_UPDATE_ANY],
    });
  }

  private assertStatus(sample: SampleWithRelations, expected: SampleStatus) {
    if (sample.status !== expected) {
      throw AppError.conflict(ErrorCode.INVALID_SAMPLE_STATUS, `Sample must be ${expected}`, {
        expected,
        actual: sample.status,
      });
    }
  }

  private async assertActiveReferences(
    samplingPointId: string | undefined,
    parameterIds: string[] | undefined,
    existing?: SampleWithRelations,
  ) {
    if (samplingPointId && samplingPointId !== existing?.samplingPointId) {
      const point = await this.prisma.samplingPoint.findUnique({ where: { id: samplingPointId } });
      if (!point) throw AppError.notFound('Sampling point');
      if (!point.active) {
        throw AppError.badRequest(ErrorCode.INACTIVE_REFERENCE, 'Sampling point is inactive', { samplingPointId });
      }
    }
    const kept = new Set(existing?.results.map((result) => result.parameterId) ?? []);
    const newIds = (parameterIds ?? []).filter((id) => !kept.has(id));
    if (newIds.length > 0) {
      const parameters = await this.prisma.parameter.findMany({ where: { id: { in: newIds } } });
      if (parameters.length !== newIds.length) throw AppError.notFound('Parameter');
      const inactive = parameters.filter((parameter) => !parameter.active).map((parameter) => parameter.code);
      if (inactive.length > 0) {
        throw AppError.badRequest(ErrorCode.INACTIVE_REFERENCE, 'Some parameters are inactive', { inactive });
      }
    }
  }
}
