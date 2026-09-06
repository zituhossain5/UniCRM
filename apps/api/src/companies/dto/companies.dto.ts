import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CompanyStatus } from '../../generated/prisma/enums';
import { ListQueryDto } from '../../common/dto/list-query.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const email = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CompanyListQueryDto extends ListQueryDto {
  @IsUUID() @IsOptional() tag?: string;
  @IsString() @IsOptional() customFields?: string;
  @IsEnum(CompanyStatus)
  @IsOptional()
  status?: CompanyStatus;

  @IsUUID()
  @IsOptional()
  owner?: string;

  @IsIn(['name', 'createdAt', 'updatedAt', 'status'])
  @IsOptional()
  sort: 'name' | 'createdAt' | 'updatedAt' | 'status' = 'createdAt';
}

export class CreateCompanyDto {
  @IsObject() @IsOptional() customFields?: Record<string, unknown>;
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) @IsOptional() tagIds?: string[];
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @Transform(trim)
  @IsUrl({ require_protocol: true })
  @IsOptional()
  website?: string;

  @Transform(email)
  @IsEmail()
  @IsOptional()
  email?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(40)
  @IsOptional()
  phone?: string;

  @IsEnum(CompanyStatus)
  @IsOptional()
  status?: CompanyStatus;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsUUID()
  accountOwnerId?: string | null;
}

export class UpdateCompanyDto extends CreateCompanyDto {
  @IsOptional()
  declare name: string;

  @Transform(trim)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  industry?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(200)
  @IsOptional()
  addressLine1?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(200)
  @IsOptional()
  addressLine2?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  city?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  state?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(30)
  @IsOptional()
  postalCode?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  country?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  notes?: string;
}
