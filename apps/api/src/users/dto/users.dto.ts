import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { UserStatus } from '../../generated/prisma/enums';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class InviteUserDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsUUID()
  roleId!: string;
}

export class AcceptInvitationDto {
  @IsString()
  @MinLength(12)
  password!: string;
}

export class UpdateUserDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  firstName?: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  lastName?: string;

  @IsUUID()
  @IsOptional()
  roleId?: string;

  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;
}
