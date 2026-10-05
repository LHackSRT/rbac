import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { P } from '../authorization/catalog';
import { RequirePermissions } from '../authorization/decorators';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('permissions')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly prisma: PrismaService) {}

  /** The permission catalog, with the roles holding each permission directly. */
  @Get()
  @RequirePermissions(P.PERMISSION_READ)
  async list() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
      include: { roles: { include: { role: { select: { id: true, code: true, name: true } } } } },
    });
    return permissions.map((permission) => ({
      id: permission.id,
      code: permission.code,
      resource: permission.resource,
      action: permission.action,
      description: permission.description,
      roles: permission.roles.map((link) => link.role),
    }));
  }
}
