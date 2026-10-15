import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LeadPriority } from '../../generated/prisma/enums';
import { WEB_TO_LEAD_MAPPING_TARGETS, type WebToLeadMappingTarget } from '../web-to-lead.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class WebToLeadMappingDto {
  @IsString()
  @Matches(
    /^(submissionId|name|firstName|lastName|fullName|email|phone|company|subject|message|service|budget|sourceUrl|referrer|utmSource|utmMedium|utmCampaign|submittedAt|estimatedValue|priority|custom\.[a-zA-Z0-9_-]{1,80})$/,
  )
  @IsOptional()
  sourceField?: string;

  @IsOptional()
  fixedValue?: unknown;

  @IsString()
  @IsIn(WEB_TO_LEAD_MAPPING_TARGETS)
  target!: WebToLeadMappingTarget;

  @IsUUID()
  @IsOptional()
  targetId?: string;
}

export class CreateWebToLeadIntegrationDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Transform(trim)
  @IsString()
  @Matches(/^[a-z][a-z0-9_-]{0,79}$/)
  sourceKey!: string;

  @IsUUID()
  defaultPipelineId!: string;

  @IsUUID()
  defaultStageId!: string;

  @IsUUID()
  @IsOptional()
  defaultOwnerId?: string;

  @IsEnum(LeadPriority)
  defaultPriority!: LeadPriority;

  @IsArray()
  @ArrayMaxSize(25)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  @IsOptional()
  defaultTagIds?: string[];

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WebToLeadMappingDto)
  mappings!: WebToLeadMappingDto[];
}

export class UpdateWebToLeadIntegrationDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @Transform(trim)
  @IsString()
  @Matches(/^[a-z][a-z0-9_-]{0,79}$/)
  @IsOptional()
  sourceKey?: string;

  @IsUUID()
  @IsOptional()
  defaultPipelineId?: string;

  @IsUUID()
  @IsOptional()
  defaultStageId?: string;

  @IsUUID()
  @IsOptional()
  defaultOwnerId?: string;

  @IsBoolean()
  @IsOptional()
  clearDefaultOwner?: boolean;

  @IsEnum(LeadPriority)
  @IsOptional()
  defaultPriority?: LeadPriority;

  @IsArray()
  @ArrayMaxSize(25)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  @IsOptional()
  defaultTagIds?: string[];

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WebToLeadMappingDto)
  @IsOptional()
  mappings?: WebToLeadMappingDto[];

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class WebToLeadPayloadDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @IsOptional()
  submissionId?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(240)
  @IsOptional()
  name?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  firstName?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  lastName?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(240)
  @IsOptional()
  fullName?: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(320)
  @IsOptional()
  email?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(50)
  @IsOptional()
  phone?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(240)
  @IsOptional()
  company?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(240)
  @IsOptional()
  subject?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(10_000)
  @IsOptional()
  message?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(240)
  @IsOptional()
  service?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  budget?: string;

  @Transform(trim)
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  @IsOptional()
  sourceUrl?: string;

  @Transform(trim)
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  @IsOptional()
  referrer?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(240)
  @IsOptional()
  utmSource?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(240)
  @IsOptional()
  utmMedium?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(240)
  @IsOptional()
  utmCampaign?: string;

  @IsISO8601({ strict: true })
  @IsOptional()
  submittedAt?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999_999)
  @IsOptional()
  estimatedValue?: number;

  @IsEnum(LeadPriority)
  @IsOptional()
  priority?: LeadPriority;

  @IsObject()
  @IsOptional()
  custom?: Record<string, unknown>;
}
