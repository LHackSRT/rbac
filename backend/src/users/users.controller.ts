import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { P } from '../authorization/catalog';
import { Auth, RequirePermissions } from '../authorization/decorators';
import type { AuthContext } from '../common/request-context';
import {
  CreateUserDto,
  GrantPrivilegeDto,
  ListUsersQuery,
  ResetPasswordDto,
  SetRolesDto,
  UpdateStatusDto,
  UpdateUserDto,
} from './dto/users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(P.USER_READ)
  list(@Query() query: ListUsersQuery) {
    return this.users.list(query);
  }

  @Get(':id')
  @RequirePermissions(P.USER_READ)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.profile(id);
  }

  @Post()
  @RequirePermissions(P.USER_CREATE)
  create(@Auth() auth: AuthContext, @Body() dto: CreateUserDto) {
    return this.users.create(auth, dto);
  }

  @Patch(':id')
  @RequirePermissions(P.USER_UPDATE)
  update(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(auth, id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions(P.USER_UPDATE)
  setStatus(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStatusDto) {
    return this.users.setStatus(auth, id, dto);
  }

  @Post(':id/unlock')
  @HttpCode(200)
  @RequirePermissions(P.USER_UPDATE)
  unlock(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.unlock(auth, id);
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  @RequirePermissions(P.USER_UPDATE)
  resetPassword(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(auth, id, dto.newPassword);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(P.USER_DELETE)
  remove(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.remove(auth, id);
  }

  @Put(':id/roles')
  @RequirePermissions(P.USER_ASSIGN_ROLE)
  setRoles(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetRolesDto) {
    return this.users.setRoles(auth, id, dto.roles);
  }

  @Post(':id/privileges')
  @RequirePermissions(P.USER_MANAGE_PRIVILEGES)
  grantPrivilege(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GrantPrivilegeDto) {
    return this.users.grantPrivilege(auth, id, dto);
  }

  @Delete(':id/privileges/:privilegeId')
  @RequirePermissions(P.USER_MANAGE_PRIVILEGES)
  revokePrivilege(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('privilegeId', ParseUUIDPipe) privilegeId: string,
  ) {
    return this.users.revokePrivilege(auth, id, privilegeId);
  }
}
