import { Transform } from 'class-transformer';
import {
  IsDecimal,
  IsEnum,
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { PaymentMethod } from '../../generated/prisma/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreatePaymentDto {
  @IsUUID()
  companyId!: string;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsUUID()
  projectId?: string | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsUUID()
  quotationId?: string | null;

  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  amount!: string;

  @Transform(trim)
  @Matches(/^[A-Za-z]{3}$/)
  currency!: string;

  @IsISO8601({ strict: true })
  paymentDate!: string;

  @IsEnum(PaymentMethod)
  @IsOptional()
  method?: PaymentMethod | null;

  @Transform(trim)
  @IsString()
  @MaxLength(200)
  @IsOptional()
  reference?: string | null;

  @Transform(trim)
  @IsString()
  @MaxLength(10000)
  @IsOptional()
  notes?: string | null;
}

export class UpdatePaymentDto extends CreatePaymentDto {
  @IsOptional()
  declare companyId: string;

  @IsOptional()
  declare amount: string;

  @IsOptional()
  declare currency: string;

  @IsOptional()
  declare paymentDate: string;
}

export class PaymentListQueryDto extends ListQueryDto {
  @IsUUID()
  @IsOptional()
  company?: string;

  @IsUUID()
  @IsOptional()
  project?: string;

  @IsUUID()
  @IsOptional()
  quotation?: string;

  @IsEnum(PaymentMethod)
  @IsOptional()
  method?: PaymentMethod;

  @IsISO8601({ strict: true })
  @IsOptional()
  paymentDate?: string;

  @IsIn(['paymentDate', 'amount', 'createdAt', 'updatedAt'])
  @IsOptional()
  sort: 'paymentDate' | 'amount' | 'createdAt' | 'updatedAt' = 'paymentDate';
}
