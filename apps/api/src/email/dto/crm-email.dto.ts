import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EmailRelatedEntityType } from '../../generated/prisma/enums';
import { ListQueryDto } from '../../common/dto/list-query.dto';

export class CreateEmailTemplateDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsString() @MinLength(1) @MaxLength(300) subject!: string;
  @IsString() @MinLength(1) @MaxLength(50_000) body!: string;
  @IsBoolean() @IsOptional() active?: boolean;
}

export class UpdateEmailTemplateDto {
  @IsString() @MinLength(1) @MaxLength(160) @IsOptional() name?: string;
  @IsString() @MinLength(1) @MaxLength(300) @IsOptional() subject?: string;
  @IsString() @MinLength(1) @MaxLength(50_000) @IsOptional() body?: string;
  @IsBoolean() @IsOptional() active?: boolean;
}

export class PreviewEmailTemplateDto {
  @IsIn(Object.values(EmailRelatedEntityType)) relatedEntityType!: EmailRelatedEntityType;
  @IsUUID() relatedEntityId!: string;
}

export class TestEmailTemplateDto {
  @IsEmail() @MaxLength(320) to!: string;
}

export class UpdateEmailSettingsDto {
  @IsString() @MinLength(1) @MaxLength(160) fromName!: string;
  @IsEmail() @MaxLength(320) fromAddress!: string;
  @IsEmail() @MaxLength(320) @IsOptional() replyTo?: string;
}

export class SendCrmEmailDto {
  @IsIn(Object.values(EmailRelatedEntityType)) relatedEntityType!: EmailRelatedEntityType;
  @IsUUID() relatedEntityId!: string;
  @IsUUID() @IsOptional() templateId?: string;
  @IsUUID() @IsOptional() mailboxConnectionId?: string;
  @IsArray() @ArrayMaxSize(10) @IsEmail({}, { each: true }) to!: string[];
  @IsArray() @ArrayMaxSize(10) @IsEmail({}, { each: true }) @IsOptional() cc?: string[];
  @IsString() @MinLength(1) @MaxLength(300) subject!: string;
  @IsString() @MinLength(1) @MaxLength(50_000) body!: string;
}

export class EmailHistoryQueryDto extends ListQueryDto {
  @IsIn(Object.values(EmailRelatedEntityType)) relatedEntityType!: EmailRelatedEntityType;
  @IsUUID() relatedEntityId!: string;
  @Type(() => Number) page = 1;
  @Type(() => Number) limit = 25;
}

export class ComposeContextQueryDto {
  @IsIn(Object.values(EmailRelatedEntityType)) relatedEntityType!: EmailRelatedEntityType;
  @IsUUID() relatedEntityId!: string;
}
