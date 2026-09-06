import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const email = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class ContactListQueryDto extends ListQueryDto {
  @IsUUID() @IsOptional() tag?: string;
  @IsString() @IsOptional() customFields?: string;
  @IsUUID()
  @IsOptional()
  company?: string;

  @IsIn(['firstName', 'lastName', 'createdAt', 'updatedAt'])
  @IsOptional()
  sort: 'firstName' | 'lastName' | 'createdAt' | 'updatedAt' = 'createdAt';
}

export class CreateContactDto {
  @IsObject() @IsOptional() customFields?: Record<string, unknown>;
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) @IsOptional() tagIds?: string[];
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsUUID()
  companyId?: string | null;

  @Transform(trim)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  jobTitle?: string;

  @Transform(email)
  @IsEmail()
  @IsOptional()
  email?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(40)
  @IsOptional()
  phone?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(40)
  @IsOptional()
  alternatePhone?: string;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  notes?: string;
}

export class UpdateContactDto extends CreateContactDto {
  @IsOptional()
  declare firstName: string;
  @IsOptional()
  declare lastName: string;
}
