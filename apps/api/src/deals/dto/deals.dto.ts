import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsDecimal,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { LeadPriority, ProjectStatus, WorkPriority } from '../../generated/prisma/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class DealListQueryDto extends ListQueryDto {
  @IsUUID() @IsOptional() pipeline?: string;
  @IsUUID() @IsOptional() stage?: string;
  @IsUUID() @IsOptional() owner?: string;
  @IsUUID() @IsOptional() company?: string;
  @IsUUID() @IsOptional() tag?: string;
  @IsString() @IsOptional() customFields?: string;
  @IsEnum(LeadPriority) @IsOptional() priority?: LeadPriority;
  @IsDateString() @IsOptional() closeFrom?: string;
  @IsDateString() @IsOptional() closeTo?: string;
  @IsIn(['all', 'mine', 'open', 'won', 'lost'])
  @IsOptional()
  view: 'all' | 'mine' | 'open' | 'won' | 'lost' = 'open';
  @IsIn(['name', 'amount', 'probability', 'expectedCloseDate', 'createdAt', 'updatedAt'])
  @IsOptional()
  sort: 'name' | 'amount' | 'probability' | 'expectedCloseDate' | 'createdAt' | 'updatedAt' =
    'createdAt';
}

export class CreateDealDto {
  @IsObject() @IsOptional() customFields?: Record<string, unknown>;
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) @IsOptional() tagIds?: string[];
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(180) name!: string;
  @IsUUID() companyId!: string;
  @ValidateIf((_object, value) => value !== null && value !== undefined) @IsUUID() contactId?:
    string | null;
  @ValidateIf((_object, value) => value !== null && value !== undefined) @IsUUID() ownerId?:
    string | null;
  @IsUUID() @IsOptional() pipelineId?: string;
  @IsUUID() @IsOptional() stageId?: string;
  @Transform(trim)
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  @Matches(/^\d{1,17}(?:\.\d{1,2})?$/)
  @IsOptional()
  amount?: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}$/)
  @IsOptional()
  currency?: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) @IsOptional() probability?: number;
  @IsDateString() @IsOptional() expectedCloseDate?: string;
  @IsEnum(LeadPriority) @IsOptional() priority?: LeadPriority;
  @Transform(trim) @IsString() @MaxLength(10000) @IsOptional() description?: string;
}

export class UpdateDealDto extends CreateDealDto {
  @IsOptional() declare name: string;
  @IsOptional() declare companyId: string;
}

export class UpdateDealStageDto {
  @IsUUID() @IsOptional() pipelineId?: string;
  @IsUUID() stageId!: string;
  @Transform(trim) @IsString() @MaxLength(500) @IsOptional() lostReason?: string;
}

export class UpdateDealOwnerDto {
  @ValidateIf((_object, value) => value !== null) @IsUUID() ownerId!: string | null;
}

export class CreateDealProjectDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(180) @IsOptional() name?: string;
  @Transform(trim) @IsString() @MaxLength(10000) @IsOptional() description?: string;
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsUUID()
  projectManagerId?: string | null;
  @IsEnum(ProjectStatus) @IsOptional() status?: ProjectStatus;
  @IsEnum(WorkPriority) @IsOptional() priority?: WorkPriority;
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsDateString()
  startDate?: string | null;
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsDateString()
  deadline?: string | null;
}
