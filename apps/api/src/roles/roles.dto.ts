import { IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name!: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  description?: string;

  @IsArray()
  @Matches(/^[a-z]+(?:\.[a-z]+)+$/, { each: true })
  permissionKeys!: string[];
}

export class UpdateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  description?: string;

  @IsArray()
  @Matches(/^[a-z]+(?:\.[a-z]+)+$/, { each: true })
  @IsOptional()
  permissionKeys?: string[];
}
