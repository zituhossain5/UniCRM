import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import {
  CustomerCasePriority,
  CustomerCaseStatus,
  CustomerCaseType,
  TaskStatus,
  WorkPriority,
} from '../../generated/prisma/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CaseListQueryDto extends ListQueryDto {
  @IsIn(['all', 'mine', 'unassigned', 'open', 'waiting', 'overdue', 'resolved'])
  @IsOptional()
  view: 'all' | 'mine' | 'unassigned' | 'open' | 'waiting' | 'overdue' | 'resolved' = 'all';

  @IsEnum(CustomerCaseStatus) @IsOptional() status?: CustomerCaseStatus;
  @IsEnum(CustomerCasePriority) @IsOptional() priority?: CustomerCasePriority;
  @IsEnum(CustomerCaseType) @IsOptional() type?: CustomerCaseType;
  @IsUUID() @IsOptional() assignee?: string;
  @IsUUID() @IsOptional() company?: string;
  @IsUUID() @IsOptional() contact?: string;
  @IsUUID() @IsOptional() lead?: string;
  @IsUUID() @IsOptional() deal?: string;
  @IsDateString() @IsOptional() dueFrom?: string;
  @IsDateString() @IsOptional() dueTo?: string;
  @IsIn(['caseNumber', 'title', 'status', 'priority', 'dueAt', 'createdAt', 'updatedAt'])
  @IsOptional()
  sort: 'caseNumber' | 'title' | 'status' | 'priority' | 'dueAt' | 'createdAt' | 'updatedAt' =
    'updatedAt';
}

export class CreateCaseDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(220) title!: string;
  @Transform(trim) @IsString() @MaxLength(20000) @IsOptional() description?: string;
  @IsEnum(CustomerCaseType) @IsOptional() type?: CustomerCaseType;
  @IsEnum(CustomerCaseStatus) @IsOptional() status?: CustomerCaseStatus;
  @IsEnum(CustomerCasePriority) @IsOptional() priority?: CustomerCasePriority;
  @ValidateIf((_o, value) => value !== null && value !== undefined) @IsUUID() contactId?:
    string | null;
  @ValidateIf((_o, value) => value !== null && value !== undefined) @IsUUID() companyId?:
    string | null;
  @ValidateIf((_o, value) => value !== null && value !== undefined) @IsUUID() leadId?:
    string | null;
  @ValidateIf((_o, value) => value !== null && value !== undefined) @IsUUID() dealId?:
    string | null;
  @ValidateIf((_o, value) => value !== null && value !== undefined) @IsUUID() sourceThreadId?:
    string | null;
  @ValidateIf((_o, value) => value !== null && value !== undefined) @IsUUID() assignedUserId?:
    string | null;
  @ValidateIf((_o, value) => value !== null && value !== undefined) @IsDateString() dueAt?:
    string | null;
}

export class UpdateCaseDto extends CreateCaseDto {
  @IsOptional() declare title: string;
}

export class CreateCaseCommentDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(5000) content!: string;
}

export class CreateCaseTaskDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(220) title!: string;
  @Transform(trim) @IsString() @MaxLength(10000) @IsOptional() description?: string;
  @ValidateIf((_o, value) => value !== null && value !== undefined) @IsUUID() assigneeId?:
    string | null;
  @IsEnum(TaskStatus) @IsOptional() status?: TaskStatus;
  @IsEnum(WorkPriority) @IsOptional() priority?: WorkPriority;
  @ValidateIf((_o, value) => value !== null && value !== undefined) @IsDateString() dueDate?:
    string | null;
}

export class CaseReportQueryDto {
  @IsDateString() @IsOptional() from?: string;
  @IsDateString() @IsOptional() to?: string;
  @IsUUID() @IsOptional() assignee?: string;
}
