import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsDecimal,
  IsEmail,
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
import {
  FollowUpType,
  LeadActivityType,
  LeadPriority,
  LeadSource,
} from '../../generated/prisma/enums';
import { ListQueryDto } from '../../common/dto/list-query.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const email = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class LeadListQueryDto extends ListQueryDto {
  @IsUUID() @IsOptional() stage?: string;
  @IsUUID() @IsOptional() owner?: string;
  @IsUUID() @IsOptional() company?: string;
  @IsEnum(LeadPriority) @IsOptional() priority?: LeadPriority;
  @IsEnum(LeadSource) @IsOptional() source?: LeadSource;
  @IsIn(['all', 'mine', 'followUpDue', 'won', 'lost'])
  @IsOptional()
  view: 'all' | 'mine' | 'followUpDue' | 'won' | 'lost' = 'all';
  @IsDateString() @IsOptional() createdFrom?: string;
  @IsDateString() @IsOptional() createdTo?: string;
  @IsIn(['title', 'createdAt', 'updatedAt', 'estimatedValue', 'nextFollowUpAt', 'lastActivityAt'])
  @IsOptional()
  sort:
    'title' | 'createdAt' | 'updatedAt' | 'estimatedValue' | 'nextFollowUpAt' | 'lastActivityAt' =
    'createdAt';
}

export class CreateLeadDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(180) title!: string;
  @Transform(trim) @IsString() @MaxLength(100) @IsOptional() firstName?: string;
  @Transform(trim) @IsString() @MaxLength(100) @IsOptional() lastName?: string;
  @Transform(email) @IsEmail() @IsOptional() email?: string;
  @Transform(trim) @IsString() @MaxLength(40) @IsOptional() phone?: string;
  @IsEnum(LeadSource) @IsOptional() source?: LeadSource;
  @IsEnum(LeadPriority) @IsOptional() priority?: LeadPriority;
  @ValidateIf((_object, value) => value !== null && value !== undefined) @IsUUID() companyId?:
    string | null;
  @ValidateIf((_object, value) => value !== null && value !== undefined) @IsUUID() contactId?:
    string | null;
  @ValidateIf((_object, value) => value !== null && value !== undefined) @IsUUID() ownerId?:
    string | null;
  @Transform(trim)
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  @Matches(/^\d{1,17}(?:\.\d{1,2})?$/)
  @IsOptional()
  estimatedValue?: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}$/)
  @IsOptional()
  currency?: string;
  @Transform(trim) @IsString() @MaxLength(5000) @IsOptional() description?: string;
  @Transform(trim) @IsString() @MaxLength(10000) @IsOptional() notes?: string;
  @IsDateString() @IsOptional() nextFollowUpAt?: string;
}

export class UpdateLeadDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(180) @IsOptional() title?: string;
  @Transform(trim) @IsString() @MaxLength(100) @IsOptional() firstName?: string;
  @Transform(trim) @IsString() @MaxLength(100) @IsOptional() lastName?: string;
  @Transform(email) @IsEmail() @IsOptional() email?: string;
  @Transform(trim) @IsString() @MaxLength(40) @IsOptional() phone?: string;
  @IsEnum(LeadSource) @IsOptional() source?: LeadSource;
  @IsEnum(LeadPriority) @IsOptional() priority?: LeadPriority;
  @ValidateIf((_object, value) => value !== null && value !== undefined) @IsUUID() companyId?:
    string | null;
  @ValidateIf((_object, value) => value !== null && value !== undefined) @IsUUID() contactId?:
    string | null;
  @Transform(trim)
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  @Matches(/^\d{1,17}(?:\.\d{1,2})?$/)
  @IsOptional()
  estimatedValue?: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}$/)
  @IsOptional()
  currency?: string;
  @Transform(trim) @IsString() @MaxLength(5000) @IsOptional() description?: string;
  @Transform(trim) @IsString() @MaxLength(10000) @IsOptional() notes?: string;
}

export class UpdateLeadStageDto {
  @IsUUID() stageId!: string;
  @Transform(trim) @IsString() @MaxLength(500) @IsOptional() lostReason?: string;
}

export class UpdateLeadOwnerDto {
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  ownerId!: string | null;
}

export class CreateActivityDto {
  @IsIn([
    LeadActivityType.NOTE,
    LeadActivityType.CALL,
    LeadActivityType.MEETING,
    LeadActivityType.EMAIL,
  ])
  type!: LeadActivityType;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(180) title!: string;
  @Transform(trim) @IsString() @MaxLength(5000) @IsOptional() description?: string;
  @IsDateString() @IsOptional() occurredAt?: string;
}

export class ActivityListQueryDto extends ListQueryDto {
  @IsIn(['occurredAt', 'createdAt']) @IsOptional() sort: 'occurredAt' | 'createdAt' = 'occurredAt';
}

export class CreateFollowUpDto {
  @IsDateString() dueAt!: string;
  @IsEnum(FollowUpType) @IsOptional() type?: FollowUpType;
  @Transform(trim) @IsString() @MaxLength(2000) @IsOptional() notes?: string;
  @ValidateIf((_object, value) => value !== null && value !== undefined) @IsUUID() assignedToId?:
    string | null;
}

export class RescheduleFollowUpDto {
  @IsDateString() dueAt!: string;
  @Transform(trim) @IsString() @MaxLength(2000) @IsOptional() notes?: string;
  @ValidateIf((_object, value) => value !== null && value !== undefined) @IsUUID() assignedToId?:
    string | null;
}

export class FollowUpListQueryDto extends ListQueryDto {
  @IsIn(['today', 'overdue', 'upcoming', 'all'])
  @IsOptional()
  scope: 'today' | 'overdue' | 'upcoming' | 'all' = 'all';
  @IsIn(['true', 'false'])
  @IsOptional()
  mine: 'true' | 'false' = 'false';
  @IsUUID() @IsOptional() lead?: string;
  @IsIn(['dueAt', 'createdAt']) @IsOptional() sort: 'dueAt' | 'createdAt' = 'dueAt';
}
