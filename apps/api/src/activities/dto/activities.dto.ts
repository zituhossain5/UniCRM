import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import {
  ScheduledActivityRelatedEntityType,
  ScheduledActivityStatus,
  ScheduledActivityType,
  WorkPriority,
} from '../../generated/prisma/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ActivityListQueryDto extends ListQueryDto {
  @IsIn(['today', 'upcoming', 'overdue', 'completed', 'mine', 'all'])
  @IsOptional()
  view: 'today' | 'upcoming' | 'overdue' | 'completed' | 'mine' | 'all' = 'today';

  @IsIn(['CALL', 'MEETING', 'FOLLOW_UP', 'OTHER', 'TASK', 'PROJECT_DEADLINE'])
  @IsOptional()
  type?: ScheduledActivityType | 'TASK' | 'PROJECT_DEADLINE';

  @IsUUID()
  @IsOptional()
  owner?: string;

  @IsEnum(ScheduledActivityStatus)
  @IsOptional()
  status?: ScheduledActivityStatus;

  @IsEnum(ScheduledActivityRelatedEntityType)
  @IsOptional()
  relatedEntityType?: ScheduledActivityRelatedEntityType;

  @IsUUID()
  @IsOptional()
  relatedEntityId?: string;

  @IsISO8601({ strict: true })
  @IsOptional()
  dateFrom?: string;

  @IsISO8601({ strict: true })
  @IsOptional()
  dateTo?: string;

  @IsIn(['startAt', 'subject', 'priority', 'status'])
  @IsOptional()
  sort: 'startAt' | 'subject' | 'priority' | 'status' = 'startAt';
}

export class CreateScheduledActivityDto {
  @IsEnum(ScheduledActivityType)
  type!: ScheduledActivityType;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(220)
  subject!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(10000)
  @IsOptional()
  description?: string;

  @IsEnum(ScheduledActivityRelatedEntityType)
  relatedEntityType!: ScheduledActivityRelatedEntityType;

  @IsUUID()
  relatedEntityId!: string;

  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @IsISO8601({ strict: true })
  startAt!: string;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsISO8601({ strict: true })
  endAt?: string | null;

  @IsEnum(WorkPriority)
  @IsOptional()
  priority?: WorkPriority;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsISO8601({ strict: true })
  reminderAt?: string | null;
}

export class UpdateScheduledActivityDto {
  @IsEnum(ScheduledActivityType)
  @IsOptional()
  type?: ScheduledActivityType;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(220)
  @IsOptional()
  subject?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(10000)
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @IsISO8601({ strict: true })
  @IsOptional()
  startAt?: string;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsISO8601({ strict: true })
  endAt?: string | null;

  @IsEnum(WorkPriority)
  @IsOptional()
  priority?: WorkPriority;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsISO8601({ strict: true })
  reminderAt?: string | null;
}
