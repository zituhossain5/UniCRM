import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsEmail,
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
import { EmailRelatedEntityType } from '../../generated/prisma/enums';
import { InboxPriority, InboxThreadStatus } from '../../generated/prisma/enums';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { CreateLeadDto } from '../../leads/dto/leads.dto';
import { CreateTaskDto } from '../../tasks/dto/tasks.dto';

export class CreateMailboxDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsEmail() @MaxLength(320) emailAddress!: string;
  @IsString() @MaxLength(160) @IsOptional() displayName?: string;
  @IsString() @MinLength(1) @MaxLength(255) imapHost!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(65_535) imapPort!: number;
  @IsBoolean() imapSecure!: boolean;
  @IsString() @MinLength(1) @MaxLength(255) smtpHost!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(65_535) smtpPort!: number;
  @IsBoolean() smtpSecure!: boolean;
  @IsString() @MinLength(1) @MaxLength(320) username!: string;
  @IsString() @MinLength(1) @MaxLength(4096) credential!: string;
}

export class UpdateMailboxDto {
  @IsString() @MinLength(1) @MaxLength(160) @IsOptional() name?: string;
  @IsEmail() @MaxLength(320) @IsOptional() emailAddress?: string;
  @IsString() @MaxLength(160) @IsOptional() displayName?: string;
  @IsString() @MinLength(1) @MaxLength(255) @IsOptional() imapHost?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(65_535) @IsOptional() imapPort?: number;
  @IsBoolean() @IsOptional() imapSecure?: boolean;
  @IsString() @MinLength(1) @MaxLength(255) @IsOptional() smtpHost?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(65_535) @IsOptional() smtpPort?: number;
  @IsBoolean() @IsOptional() smtpSecure?: boolean;
  @IsString() @MinLength(1) @MaxLength(320) @IsOptional() username?: string;
  @IsString() @MinLength(1) @MaxLength(4096) @IsOptional() credential?: string;
  @IsBoolean() @IsOptional() enabled?: boolean;
}

export class MailListQueryDto extends ListQueryDto {
  @IsUUID() @IsOptional() mailboxId?: string;
  @IsIn(['INBOX', 'SENT', 'UNMATCHED']) @IsOptional() view: 'INBOX' | 'SENT' | 'UNMATCHED' =
    'INBOX';
  @Type(() => Number) page = 1;
  @Type(() => Number) limit = 25;
}

export class LinkThreadDto {
  @IsIn(Object.values(EmailRelatedEntityType)) relatedEntityType!: EmailRelatedEntityType;
  @IsUUID() relatedEntityId!: string;
}

export class ReplyThreadDto {
  @IsUUID() mailboxConnectionId!: string;
  @IsString() @MinLength(1) @MaxLength(300) subject!: string;
  @IsString() @MinLength(1) @MaxLength(50_000) body!: string;
}

export class SharedInboxQueryDto extends ListQueryDto {
  @IsIn(['INBOX', 'UNASSIGNED', 'MINE', 'OPEN', 'WAITING', 'RESOLVED', 'UNMATCHED', 'SENT'])
  @IsOptional()
  view: 'INBOX' | 'UNASSIGNED' | 'MINE' | 'OPEN' | 'WAITING' | 'RESOLVED' | 'UNMATCHED' | 'SENT' =
    'INBOX';
  @IsUUID() @IsOptional() mailboxId?: string;
  @IsUUID() @IsOptional() assigneeId?: string;
  @IsEnum(InboxThreadStatus) @IsOptional() status?: InboxThreadStatus;
  @IsEnum(InboxPriority) @IsOptional() priority?: InboxPriority;
  @IsIn(['true', 'false']) @IsOptional() unread?: 'true' | 'false';
  @IsIn(['soon', 'overdue']) @IsOptional() due?: 'soon' | 'overdue';
}

export class AssignConversationDto {
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  assignedUserId!: string | null;
}

export class UpdateConversationStatusDto {
  @IsEnum(InboxThreadStatus) @IsOptional() status?: InboxThreadStatus;
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsDateString()
  dueAt?: string | null;
}

export class UpdateConversationPriorityDto {
  @IsEnum(InboxPriority) priority!: InboxPriority;
}

export class SetConversationReadDto {
  @IsBoolean() unread!: boolean;
}

export class AddConversationNoteDto {
  @IsString() @MinLength(1) @MaxLength(10_000) content!: string;
}

export class CreateLeadFromThreadDto extends CreateLeadDto {}

export class CreateTaskFromThreadDto extends CreateTaskDto {}
