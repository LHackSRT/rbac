import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, IsUUID } from 'class-validator';
import { P } from '../authorization/catalog';
import { RequirePermissions } from '../authorization/decorators';
import { PaginationQuery } from '../common/pagination';
import { AuditService } from './audit.service';

class AuditQueryDto extends PaginationQuery {
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsUUID() actorId?: string;
  @IsOptional() @IsString() targetType?: string;
  @IsOptional() @IsString() targetId?: string;
  /** Matches the actor e-mail. */
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
}

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(P.AUDIT_READ)
  list(@Query() query: AuditQueryDto) {
    return this.audit.list(query);
  }

  @Get('actions')
  @RequirePermissions(P.AUDIT_READ)
  actions() {
    return this.audit.distinctActions();
  }
}
