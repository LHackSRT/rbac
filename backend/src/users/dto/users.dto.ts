import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDate,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQuery } from '../../common/pagination';

export class ListUsersQuery extends PaginationQuery {
  /** Matches e-mail, first name or last name. */
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'DISABLED', 'LOCKED']) status?: 'ACTIVE' | 'DISABLED' | 'LOCKED';
  @IsOptional() @IsUUID() roleId?: string;
}

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(1, 100)
  firstName: string;

  @IsString()
  @Length(1, 100)
  lastName: string;

  @IsString()
  @MaxLength(200)
  password: string;

  /** Roles assigned at creation (requires user:assign-role). */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  roleIds?: string[];
}

export class UpdateUserDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(1, 100) firstName?: string;
  @IsOptional() @IsString() @Length(1, 100) lastName?: string;
}

export class UpdateStatusDto {
  @IsIn(['ACTIVE', 'DISABLED'])
  status: 'ACTIVE' | 'DISABLED';
}

export class ResetPasswordDto {
  @IsString()
  @MaxLength(200)
  newPassword: string;
}

export class RoleAssignmentDto {
  @IsUUID()
  roleId: string;

  /** Optional end of the assignment (temporary role). */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date | null;
}

export class SetRolesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleAssignmentDto)
  roles: RoleAssignmentDto[];
}

export class GrantPrivilegeDto {
  /** Permission code, e.g. "result:validate". */
  @IsString()
  permission: string;

  @IsIn(['ALLOW', 'DENY'])
  effect: 'ALLOW' | 'DENY';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Optional end of the privilege (temporary grant or suspension). */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date | null;
}
