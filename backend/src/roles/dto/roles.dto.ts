import { ArrayUnique, IsArray, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';

export class CreateRoleDto {
  /** Upper-case identifier, e.g. "SENIOR_ANALYST". */
  @Matches(/^[A-Z][A-Z0-9_]{1,49}$/, { message: 'code must be UPPER_SNAKE_CASE (2-50 characters)' })
  code: string;

  @IsString()
  @Length(1, 100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  parentIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions?: string[];
}

export class UpdateRoleDto {
  @IsOptional() @IsString() @Length(1, 100) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class SetRolePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions: string[];
}

export class SetRoleParentsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  parentIds: string[];
}
