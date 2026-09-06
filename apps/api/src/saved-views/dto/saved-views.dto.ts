import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SavedViewEntityType, SavedViewVisibility } from '../../generated/prisma/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SavedViewListQueryDto {
  @IsEnum(SavedViewEntityType) entityType!: SavedViewEntityType;
}
export class CreateSavedViewDto {
  @IsEnum(SavedViewEntityType) entityType!: SavedViewEntityType;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsObject() filters!: Record<string, unknown>;
  @IsObject() @IsOptional() sort?: Record<string, unknown>;
  @IsOptional() columns?: unknown;
  @IsEnum(SavedViewVisibility) visibility: SavedViewVisibility = SavedViewVisibility.PRIVATE;
  @IsBoolean() @IsOptional() isDefault?: boolean;
}
export class UpdateSavedViewDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) @IsOptional() name?: string;
  @IsObject() @IsOptional() filters?: Record<string, unknown>;
  @IsObject() @IsOptional() sort?: Record<string, unknown>;
  @IsOptional() columns?: unknown;
  @IsEnum(SavedViewVisibility) @IsOptional() visibility?: SavedViewVisibility;
  @IsBoolean() @IsOptional() isDefault?: boolean;
}
