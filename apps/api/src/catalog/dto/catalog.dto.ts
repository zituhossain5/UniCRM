import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDecimal,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { CatalogItemType } from '../../generated/prisma/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const optionalBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class CatalogListQueryDto extends ListQueryDto {
  @IsEnum(CatalogItemType) @IsOptional() type?: CatalogItemType;
  @IsUUID() @IsOptional() category?: string;
  @Transform(optionalBoolean) @IsBoolean() @IsOptional() active?: boolean;
  @Transform(upper) @Matches(/^[A-Z]{3}$/) @IsOptional() currency?: string;
  @IsIn(['name', 'type', 'sku', 'unitPrice', 'createdAt', 'updatedAt'])
  @IsOptional()
  sort: 'name' | 'type' | 'sku' | 'unitPrice' | 'createdAt' | 'updatedAt' = 'name';
}

export class CreateCatalogItemDto {
  @IsEnum(CatalogItemType) type!: CatalogItemType;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(180) name!: string;
  @Transform(upper) @IsString() @MaxLength(80) @IsOptional() sku?: string | null;
  @Transform(trim) @IsString() @MaxLength(10000) @IsOptional() description?: string | null;
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsUUID()
  categoryId?: string | null;
  @Transform(trim)
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  @Matches(/^\d{1,17}(?:\.\d{1,2})?$/)
  unitPrice!: string;
  @Transform(upper) @Matches(/^[A-Z]{3}$/) currency!: string;
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsDecimal({ decimal_digits: '0,4', force_decimal: false })
  taxRate?: string | null;
  @IsBoolean() @IsOptional() active?: boolean;
}

export class UpdateCatalogItemDto extends CreateCatalogItemDto {
  @IsOptional() declare type: CatalogItemType;
  @IsOptional() declare name: string;
  @IsOptional() declare unitPrice: string;
  @IsOptional() declare currency: string;
}

export class CreateCatalogCategoryDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) name!: string;
}

export class UpdateCatalogCategoryDto extends CreateCatalogCategoryDto {
  @IsOptional() declare name: string;
  @IsBoolean() @IsOptional() active?: boolean;
}
