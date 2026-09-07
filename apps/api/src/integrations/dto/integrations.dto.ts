import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  IntegrationConnectionStatus,
  IntegrationDirection,
  IntegrationEventStatus,
  IntegrationProvider,
  UnicrmIntegrationEntityType,
} from '../../generated/prisma/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateIntegrationConnectionDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEnum(IntegrationProvider)
  provider!: IntegrationProvider;

  @IsEnum(IntegrationDirection)
  direction!: IntegrationDirection;

  @IsObject()
  @IsOptional()
  configuration?: Record<string, unknown>;

  @IsString()
  @MinLength(32)
  @MaxLength(512)
  secret!: string;
}

export class UpdateIntegrationConnectionDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @IsEnum(IntegrationConnectionStatus)
  @IsOptional()
  status?: IntegrationConnectionStatus;

  @IsEnum(IntegrationDirection)
  @IsOptional()
  direction?: IntegrationDirection;

  @IsObject()
  @IsOptional()
  configuration?: Record<string, unknown>;
}

export class RotateIntegrationSecretDto {
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  secret!: string;
}

export class InboundWebhookDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  eventId!: string;

  @Transform(trim)
  @IsString()
  @Matches(/^[a-z][a-z0-9_.-]{0,119}$/)
  eventType!: string;

  @IsISO8601({ strict: true })
  occurredAt!: string;

  @IsObject()
  data!: Record<string, unknown>;
}

export class CreateWebhookSubscriptionDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsUUID()
  connectionId!: string;

  @Transform(trim)
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  targetUrl!: string;

  @IsString()
  @MinLength(32)
  @MaxLength(512)
  secret!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  eventTypes!: string[];
}

export class UpdateWebhookSubscriptionDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @Transform(trim)
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  @IsOptional()
  targetUrl?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  eventTypes?: string[];
}

export class IntegrationEventListQueryDto {
  @IsEnum(IntegrationEventStatus)
  @IsOptional()
  status?: IntegrationEventStatus;
}

export class CreateExternalMappingDto {
  @IsUUID()
  connectionId!: string;

  @Transform(trim)
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{0,79}$/)
  externalEntityType!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  externalEntityId!: string;

  @IsEnum(UnicrmIntegrationEntityType)
  unicrmEntityType!: UnicrmIntegrationEntityType;

  @IsUUID()
  unicrmEntityId!: string;
}
