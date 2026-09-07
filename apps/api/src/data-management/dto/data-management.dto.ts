import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  DataExportEntityType,
  DataImportEntityType,
  DuplicateEntityType,
  MergeEntityType,
} from '../../generated/prisma/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ImportPreviewDto {
  @IsEnum(DataImportEntityType)
  entityType!: DataImportEntityType;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MinLength(1)
  csv!: string;
}

export class CommitImportDto extends ImportPreviewDto {
  @IsBoolean()
  @IsOptional()
  dryRun?: boolean;
}

export class CreateExportDto {
  @IsEnum(DataExportEntityType)
  entityType!: DataExportEntityType;

  @IsObject()
  @IsOptional()
  filters?: Record<string, unknown>;
}

export class DuplicateQueryDto {
  @IsEnum(DuplicateEntityType)
  entityType!: DuplicateEntityType;
}

export class MergeRecordsDto {
  @IsEnum(MergeEntityType)
  entityType!: MergeEntityType;

  @IsUUID()
  sourceId!: string;

  @IsUUID()
  targetId!: string;
}

export class BulkUpdateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsObject()
  updates!: Record<string, unknown>;
}

export class DataJobListQueryDto {
  @IsEnum(DataImportEntityType)
  @IsOptional()
  importEntityType?: DataImportEntityType;

  @IsEnum(DataExportEntityType)
  @IsOptional()
  exportEntityType?: DataExportEntityType;
}
