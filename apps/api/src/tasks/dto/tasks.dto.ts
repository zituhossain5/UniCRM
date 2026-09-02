import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { TaskStatus, WorkPriority } from '../../generated/prisma/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class TaskListQueryDto extends ListQueryDto {
  @IsUUID()
  @IsOptional()
  project?: string;

  @IsUUID()
  @IsOptional()
  assignee?: string;

  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @IsEnum(WorkPriority)
  @IsOptional()
  priority?: WorkPriority;

  @IsISO8601({ strict: true })
  @IsOptional()
  dueDate?: string;

  @IsIn(['all', 'mine', 'dueToday', 'overdue'])
  @IsOptional()
  view?: 'all' | 'mine' | 'dueToday' | 'overdue';

  @IsIn(['title', 'createdAt', 'updatedAt', 'dueDate', 'status', 'priority'])
  @IsOptional()
  sort: 'title' | 'createdAt' | 'updatedAt' | 'dueDate' | 'status' | 'priority' = 'createdAt';
}

export class CreateTaskDto {
  @IsUUID()
  projectId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(220)
  title!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(10000)
  @IsOptional()
  description?: string;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsUUID()
  assigneeId?: string | null;

  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @IsEnum(WorkPriority)
  @IsOptional()
  priority?: WorkPriority;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsISO8601({ strict: true })
  startDate?: string | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsISO8601({ strict: true })
  dueDate?: string | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  estimatedMinutes?: number | null;
}

export class UpdateTaskDto extends CreateTaskDto {
  @IsOptional()
  declare projectId: string;

  @IsOptional()
  declare title: string;
}

export class CreateTaskCommentDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;
}

export class UpdateTaskCommentDto extends CreateTaskCommentDto {}
