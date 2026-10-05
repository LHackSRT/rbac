import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';
import { AppError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from './authorization.service';
import { P } from './catalog';
import { RequirePermissions } from './decorators';

class CheckAccessDto {
  @IsUUID()
  userId: string;

  /** Permission code, e.g. "result:validate". */
  @IsString()
  permission: string;
}

export type CheckOutcome = 'GRANTED' | 'DENIED_BY_PRIVILEGE' | 'NOT_GRANTED' | 'USER_DISABLED' | 'UNKNOWN_PERMISSION';

@ApiTags('authorization')
@ApiBearerAuth()
@Controller('authz')
export class AuthzController {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly prisma: PrismaService,
  ) {}

  /** Access tester: tells whether a user holds a permission, and why. */
  @Post('check')
  @HttpCode(200)
  @RequirePermissions(P.USER_READ, P.PERMISSION_READ)
  async check(@Body() dto: CheckAccessDto) {
    const access = await this.authorization.loadUserAccess(dto.userId);
    if (!access) throw AppError.notFound('User');
    const known = await this.prisma.permission.findUnique({ where: { code: dto.permission } });
    const decision = access.permissions.explain(dto.permission);

    let outcome: CheckOutcome;
    if (!known) outcome = 'UNKNOWN_PERMISSION';
    else if (access.user.status === 'DISABLED') outcome = 'USER_DISABLED';
    else if (decision.allowed) outcome = 'GRANTED';
    else if (decision.denial) outcome = 'DENIED_BY_PRIVILEGE';
    else outcome = 'NOT_GRANTED';

    return { user: access.user, permission: dto.permission, allowed: decision.allowed, outcome, decision };
  }
}
