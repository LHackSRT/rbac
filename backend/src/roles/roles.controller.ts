import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { P } from '../authorization/catalog';
import { Auth, RequirePermissions } from '../authorization/decorators';
import type { AuthContext } from '../common/request-context';
import { CreateRoleDto, SetRoleParentsDto, SetRolePermissionsDto, UpdateRoleDto } from './dto/roles.dto';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions(P.ROLE_READ)
  list() {
    return this.roles.list();
  }

  @Get(':id')
  @RequirePermissions(P.ROLE_READ)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.roles.get(id);
  }

  @Post()
  @RequirePermissions(P.ROLE_MANAGE)
  create(@Auth() auth: AuthContext, @Body() dto: CreateRoleDto) {
    return this.roles.create(auth, dto);
  }

  @Patch(':id')
  @RequirePermissions(P.ROLE_MANAGE)
  update(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(auth, id, dto);
  }

  @Put(':id/permissions')
  @RequirePermissions(P.ROLE_MANAGE)
  setPermissions(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetRolePermissionsDto) {
    return this.roles.setPermissions(auth, id, dto.permissions);
  }

  @Put(':id/parents')
  @RequirePermissions(P.ROLE_MANAGE)
  setParents(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetRoleParentsDto) {
    return this.roles.setParents(auth, id, dto.parentIds);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(P.ROLE_MANAGE)
  remove(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.roles.remove(auth, id);
  }
}
