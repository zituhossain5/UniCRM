import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AutomationEntityType, AutomationTriggerType } from '../../generated/prisma/enums';
import { ACTION_TYPES, CONDITION_FIELDS, CONDITION_OPERATORS } from '../automation.constants';

export class AutomationTriggerConfigDto {
  @IsString()
  @MaxLength(80)
  @IsOptional()
  from?: string;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  to?: string;
}

export class AutomationConditionDto {
  @IsIn(CONDITION_FIELDS)
  field!: (typeof CONDITION_FIELDS)[number];

  @IsIn(CONDITION_OPERATORS)
  operator!: (typeof CONDITION_OPERATORS)[number];

  @IsUUID()
  @IsOptional()
  fieldDefinitionId?: string;

  @IsOptional()
  value?: unknown;
}

export class AutomationActionDto {
  @IsIn(ACTION_TYPES)
  type!: (typeof ACTION_TYPES)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @IsOptional()
  title?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  message?: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @IsUUID()
  @IsOptional()
  tagId?: string;

  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @IsUUID()
  @IsOptional()
  webhookSubscriptionId?: string;

  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  @IsOptional()
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

  @IsIn(['CALL', 'MEETING', 'EMAIL', 'OTHER'])
  @IsOptional()
  followUpType?: 'CALL' | 'MEETING' | 'EMAIL' | 'OTHER';

  @IsInt()
  @Min(0)
  @Max(365)
  @IsOptional()
  dueInDays?: number;
}

export class CreateAutomationRuleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsIn(Object.values(AutomationEntityType))
  entityType!: AutomationEntityType;

  @IsIn(Object.values(AutomationTriggerType))
  triggerType!: AutomationTriggerType;

  @IsObject()
  @ValidateNested()
  @Type(() => AutomationTriggerConfigDto)
  @IsOptional()
  triggerConfig?: AutomationTriggerConfigDto;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AutomationConditionDto)
  conditions!: AutomationConditionDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AutomationActionDto)
  actions!: AutomationActionDto[];

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class UpdateAutomationRuleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @IsOptional()
  name?: string;

  @IsIn(Object.values(AutomationEntityType))
  @IsOptional()
  entityType?: AutomationEntityType;

  @IsIn(Object.values(AutomationTriggerType))
  @IsOptional()
  triggerType?: AutomationTriggerType;

  @IsObject()
  @ValidateNested()
  @Type(() => AutomationTriggerConfigDto)
  @IsOptional()
  triggerConfig?: AutomationTriggerConfigDto;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AutomationConditionDto)
  @IsOptional()
  conditions?: AutomationConditionDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AutomationActionDto)
  @IsOptional()
  actions?: AutomationActionDto[];

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
