import { ParameterCategory, SampleStatus, SamplingPointType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQuery } from '../../common/pagination';

const toBoolean = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

// --- Sampling points -------------------------------------------------------

export class ListSamplingPointsQuery {
  @IsOptional() @Transform(toBoolean) @IsBoolean() includeInactive?: boolean;
}

export class CreateSamplingPointDto {
  @Matches(/^[A-Z0-9-]{2,30}$/, { message: 'code must contain 2-30 upper-case letters, digits or dashes' })
  code: string;

  @IsString() @Length(1, 120) name: string;
  @IsEnum(SamplingPointType) type: SamplingPointType;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateSamplingPointDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsEnum(SamplingPointType) type?: SamplingPointType;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

// --- Parameters ------------------------------------------------------------

export class ListParametersQuery extends ListSamplingPointsQuery {}

export class CreateParameterDto {
  @Matches(/^[A-Z0-9_]{1,20}$/, { message: 'code must contain 1-20 upper-case letters, digits or underscores' })
  code: string;

  @IsString() @Length(1, 120) name: string;
  @IsString() @Length(1, 30) unit: string;
  @IsEnum(ParameterCategory) category: ParameterCategory;
  @IsOptional() @IsNumber() minValue?: number | null;
  @IsOptional() @IsNumber() maxValue?: number | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateParameterDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() @Length(1, 30) unit?: string;
  @IsOptional() @IsEnum(ParameterCategory) category?: ParameterCategory;
  @IsOptional() @IsNumber() minValue?: number | null;
  @IsOptional() @IsNumber() maxValue?: number | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

// --- Samples ---------------------------------------------------------------

export class ListSamplesQuery extends PaginationQuery {
  @IsOptional() @IsEnum(SampleStatus) status?: SampleStatus;
  @IsOptional() @IsUUID() samplingPointId?: string;
  /** Reference number, notes or sampling point. */
  @IsOptional() @IsString() search?: string;
  /** Only samples collected by the current user. */
  @IsOptional() @Transform(toBoolean) @IsBoolean() mine?: boolean;
}

export class CreateSampleDto {
  @IsUUID() samplingPointId: string;
  @Type(() => Date) @IsDate() sampledAt: Date;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;

  /** Parameters to analyse. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  parameterIds: string[];
}

export class UpdateSampleDto {
  @IsOptional() @IsUUID() samplingPointId?: string;
  @IsOptional() @Type(() => Date) @IsDate() sampledAt?: Date;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  parameterIds?: string[];
}

export class ResultValueDto {
  @IsUUID() parameterId: string;
  /** Measured value, or null to clear it. */
  @IsOptional() @IsNumber() value: number | null;
}

export class EnterResultsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ResultValueDto)
  results: ResultValueDto[];
}

export class RejectSampleDto {
  @IsString() @Length(3, 500) reason: string;
}

// --- Reports ---------------------------------------------------------------

export class ReportQuery extends PaginationQuery {
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
  @IsOptional() @IsUUID() samplingPointId?: string;
  @IsOptional() @IsUUID() parameterId?: string;
  @IsOptional() @Transform(toBoolean) @IsBoolean() nonCompliantOnly?: boolean;
}
