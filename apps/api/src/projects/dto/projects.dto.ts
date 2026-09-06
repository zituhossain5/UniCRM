import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDecimal,
  IsEnum,
  IsISO8601,
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
import { ProjectStatus, WorkPriority } from '../../generated/prisma/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ProjectListQueryDto extends ListQueryDto {
  @IsUUID() @IsOptional() tag?: string;
  @IsString() @IsOptional() customFields?: string;
  @IsEnum(ProjectStatus)
  @IsOptional()
  status?: ProjectStatus;

  @IsEnum(WorkPriority)
  @IsOptional()
  priority?: WorkPriority;

  @IsUUID()
  @IsOptional()
  manager?: string;

  @IsUUID()
  @IsOptional()
  company?: string;

  @IsISO8601({ strict: true })
  @IsOptional()
  deadline?: string;

  @IsIn(['all', 'active', 'planned', 'onHold', 'completed'])
  @IsOptional()
  view?: 'all' | 'active' | 'planned' | 'onHold' | 'completed';

  @IsIn(['name', 'createdAt', 'updatedAt', 'deadline', 'status', 'priority', 'progress'])
  @IsOptional()
  sort: 'name' | 'createdAt' | 'updatedAt' | 'deadline' | 'status' | 'priority' | 'progress' =
    'createdAt';
}

export class CreateProjectDto {
  @IsObject() @IsOptional() customFields?: Record<string, unknown>;
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) @IsOptional() tagIds?: string[];
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(10000)
  @IsOptional()
  description?: string;

  @IsUUID()
  companyId!: string;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsUUID()
  projectManagerId?: string | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsUUID()
  sourceLeadId?: string | null;

  @IsEnum(ProjectStatus)
  @IsOptional()
  status?: ProjectStatus;

  @IsEnum(WorkPriority)
  @IsOptional()
  priority?: WorkPriority;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsISO8601({ strict: true })
  startDate?: string | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsISO8601({ strict: true })
  deadline?: string | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  projectValue?: string | null;

  @Transform(trim)
  @Matches(/^[A-Za-z]{3}$/)
  @IsOptional()
  currency?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  progress?: number;
}

export class UpdateProjectDto extends CreateProjectDto {
  @IsOptional()
  declare name: string;

  @IsOptional()
  declare companyId: string;

  @IsOptional()
  declare sourceLeadId?: string | null;
}

export class AddProjectMemberDto {
  @IsUUID()
  userId!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(80)
  @IsOptional()
  role?: string;
}
