import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ConfigurableEntityType, CustomFieldType } from '../../generated/prisma/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const key = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
    : value;

export class CustomFieldListQueryDto {
  @IsEnum(ConfigurableEntityType) entityType!: ConfigurableEntityType;
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class CreateCustomFieldDefinitionDto {
  @IsEnum(ConfigurableEntityType) entityType!: ConfigurableEntityType;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @Transform(key)
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,79}$/)
  key!: string;
  @IsEnum(CustomFieldType) fieldType!: CustomFieldType;
  @IsBoolean() @IsOptional() required?: boolean;
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @IsOptional()
  options?: string[];
}

export class UpdateCustomFieldDefinitionDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) @IsOptional() name?: string;
  @Transform(key) @IsString() @Matches(/^[a-z][a-z0-9_]{0,79}$/) @IsOptional() key?: string;
  @IsEnum(CustomFieldType) @IsOptional() fieldType?: CustomFieldType;
  @IsBoolean() @IsOptional() required?: boolean;
  @IsBoolean() @IsOptional() active?: boolean;
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @IsOptional()
  options?: string[];
}

export class CustomFieldPositionDto {
  @IsUUID() id!: string;
  @IsInt() @Min(0) position!: number;
}

export class ReorderCustomFieldsDto {
  @IsArray()
  @ArrayUnique((item: CustomFieldPositionDto) => item.id)
  @ValidateNested({ each: true })
  @Type(() => CustomFieldPositionDto)
  fields!: CustomFieldPositionDto[];
}

export class SetCustomFieldValuesDto {
  @IsEnum(ConfigurableEntityType) entityType!: ConfigurableEntityType;
  @IsUUID() entityId!: string;
  @IsObject() values!: Record<string, unknown>;
}
