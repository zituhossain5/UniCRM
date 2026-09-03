import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDecimal,
  IsEnum,
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { DiscountType, QuotationStatus } from '../../generated/prisma/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class QuotationItemDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @IsDecimal({ decimal_digits: '0,4', force_decimal: false })
  quantity!: string;

  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  unitPrice!: string;
}

export class CreateQuotationDto {
  @IsUUID()
  companyId!: string;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsUUID()
  contactId?: string | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsUUID()
  leadId?: string | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsUUID()
  projectId?: string | null;

  @IsISO8601({ strict: true })
  issueDate!: string;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsISO8601({ strict: true })
  expiryDate?: string | null;

  @Transform(trim)
  @Matches(/^[A-Za-z]{3}$/)
  currency!: string;

  @IsEnum(DiscountType)
  @IsOptional()
  discountType?: DiscountType | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsDecimal({ decimal_digits: '0,4', force_decimal: false })
  discountValue?: string | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsDecimal({ decimal_digits: '0,4', force_decimal: false })
  taxRate?: string | null;

  @Transform(trim)
  @IsString()
  @MaxLength(10000)
  @IsOptional()
  notes?: string | null;

  @Transform(trim)
  @IsString()
  @MaxLength(10000)
  @IsOptional()
  terms?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items!: QuotationItemDto[];
}

export class UpdateQuotationDto extends CreateQuotationDto {
  @IsOptional()
  declare companyId: string;

  @IsOptional()
  declare issueDate: string;

  @IsOptional()
  declare currency: string;

  @IsOptional()
  declare items: QuotationItemDto[];
}

export class QuotationListQueryDto extends ListQueryDto {
  @IsEnum(QuotationStatus)
  @IsOptional()
  status?: QuotationStatus;

  @IsUUID()
  @IsOptional()
  company?: string;

  @IsUUID()
  @IsOptional()
  lead?: string;

  @IsUUID()
  @IsOptional()
  project?: string;

  @IsUUID()
  @IsOptional()
  createdBy?: string;

  @Matches(/^[A-Za-z]{3}$/)
  @IsOptional()
  currency?: string;

  @IsISO8601({ strict: true })
  @IsOptional()
  issueDate?: string;

  @IsISO8601({ strict: true })
  @IsOptional()
  expiryDate?: string;

  @IsIn(['quotationNumber', 'issueDate', 'expiryDate', 'total', 'createdAt', 'updatedAt'])
  @IsOptional()
  sort: 'quotationNumber' | 'issueDate' | 'expiryDate' | 'total' | 'createdAt' | 'updatedAt' =
    'createdAt';
}
